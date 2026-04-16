from __future__ import annotations

import asyncio
import inspect
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from .account_store import resolve_account_file
from .base import BaseVideoUploader
from .browser import launch_chromium, set_init_script
from .login_qrcode import (
    build_login_qrcode_path,
    decode_qrcode_from_path,
    print_terminal_qrcode,
    remove_qrcode_file,
    save_data_url_image,
)

DOUYIN_PUBLISH_STRATEGY_IMMEDIATE = "immediate"
DOUYIN_PUBLISH_STRATEGY_SCHEDULED = "scheduled"

logger = logging.getLogger("publish.douyin")

GENERIC_ACCOUNT_NAME_TOKENS = (
    "创作者中心",
    "创作者服务平台",
    "抖音",
    "douyin",
)


@dataclass(slots=True)
class DouyinVideoUploadRequest:
    account_name: str
    video_file: Path
    title: str
    description: str
    tags: list[str]
    publish_date: datetime | int = 0
    publish_strategy: str = DOUYIN_PUBLISH_STRATEGY_IMMEDIATE
    headless: bool = True


def _resolve_async_playwright():
    try:
        from patchright.async_api import async_playwright  # type: ignore

        return async_playwright
    except Exception:
        try:
            from playwright.async_api import async_playwright  # type: ignore

            return async_playwright
        except Exception as exc:
            raise RuntimeError(
                "未检测到可用浏览器自动化依赖，请安装 patchright 或 playwright。"
            ) from exc


def runtime_check() -> tuple[bool, str]:
    try:
        _resolve_async_playwright()
    except Exception as exc:
        return False, str(exc)
    return True, ""


def _msg(emoji: str, text: str) -> str:
    return f"{emoji} {text}"


async def _emit_qrcode_callback(qrcode_callback, payload: dict):
    if not qrcode_callback:
        return

    callback_result = qrcode_callback(payload)
    if inspect.isawaitable(callback_result):
        await callback_result


def _build_login_result(
    success: bool,
    status: str,
    message: str,
    account_file: str,
    qrcode: dict | None = None,
    current_url: str = "",
    account_name: str = "",
) -> dict:
    return {
        "success": success,
        "status": status,
        "message": message,
        "account_file": str(account_file),
        "qrcode": qrcode,
        "current_url": current_url,
        "account_name": account_name,
    }


async def cookie_auth(account_file: str) -> bool:
    return await cookie_auth_with_mode(account_file, headless=True)


async def _is_login_form_visible(page) -> bool:
    markers = [
        page.get_by_text("扫码登录", exact=True).first,
        page.get_by_text("手机号登录", exact=True).first,
        page.locator('input[name="normal-input"]').first,
        page.locator('input[name="button-input"]').first,
    ]

    for marker in markers:
        try:
            if await marker.count() and await marker.is_visible():
                return True
        except Exception:
            continue
    return False


async def _has_upload_entry(page) -> bool:
    file_input = page.locator('input[type="file"]').first
    try:
        if await file_input.count():
            return True
    except Exception:
        pass

    upload_markers = [
        page.get_by_text("上传视频", exact=False).first,
        page.get_by_text("重新上传", exact=False).first,
    ]
    for marker in upload_markers:
        try:
            if await marker.count() and await marker.is_visible():
                return True
        except Exception:
            continue
    return False


async def cookie_auth_with_mode(account_file: str, *, headless: bool) -> bool:
    async_playwright = _resolve_async_playwright()
    async with async_playwright() as playwright:
        browser = await launch_chromium(playwright, headless=headless)
        try:
            context = await browser.new_context(storage_state=account_file)
            context = await set_init_script(context)
            page = await context.new_page()
            await page.goto("https://creator.douyin.com/creator-micro/content/upload")
            try:
                await page.wait_for_url("**/creator-micro/content/upload**", timeout=10000)
            except Exception:
                return False

            if await _is_login_form_visible(page):
                return False

            if not await _has_upload_entry(page):
                return False

            return True
        finally:
            await browser.close()


async def _validate_saved_cookie(account_file: str, *, headless: bool) -> bool:
    """Validate newly saved cookie with retry and cross-mode fallback.

    Douyin may transiently require extra redirects right after storage_state flush,
    and headless/headed behavior can differ across environments.
    """
    modes = [headless]
    if headless:
        modes.append(False)

    for mode in modes:
        for attempt in range(3):
            try:
                if await cookie_auth_with_mode(account_file, headless=mode):
                    return True
            except Exception:
                pass
            if attempt < 2:
                await asyncio.sleep(1.5)

    return False


async def douyin_setup(account_file, handle=False, return_detail=False, qrcode_callback=None, headless: bool = True):
    is_cookie_valid = False
    if os.path.exists(account_file):
        try:
            is_cookie_valid = await cookie_auth_with_mode(account_file, headless=headless)
        except Exception:
            is_cookie_valid = False

        # Some sites behave differently in headless mode; retry once in headed mode
        # before deciding the cookie is invalid.
        if not is_cookie_valid and headless:
            try:
                is_cookie_valid = await cookie_auth_with_mode(account_file, headless=False)
            except Exception:
                is_cookie_valid = False

    if not os.path.exists(account_file) or not is_cookie_valid:
        if not handle:
            result = _build_login_result(False, "cookie_invalid", "cookie文件不存在或已失效", account_file)
            return result if return_detail else False
        logger.info(_msg("🥹", "cookie 失效，准备重新登录"))
        result = await douyin_cookie_gen(account_file, qrcode_callback=qrcode_callback, headless=headless)
        return result if return_detail else result["success"]

    result = _build_login_result(True, "cookie_valid", "cookie有效", account_file)
    return result if return_detail else True


async def _extract_douyin_qrcode_src(page) -> str:
    scan_login_tab = page.get_by_text("扫码登录", exact=True).first
    await scan_login_tab.wait_for(timeout=30000)

    qrcode_img = (
        scan_login_tab
        .locator("..")
        .locator("xpath=following-sibling::div[1]")
        .locator('img[aria-label="二维码"]')
        .first
    )

    if not await qrcode_img.count():
        qrcode_img = page.get_by_role("img", name="二维码").first

    await qrcode_img.wait_for(state="visible", timeout=30000)
    src = await qrcode_img.get_attribute("src")
    if not src:
        raise RuntimeError("未获取到抖音登录二维码地址")

    return src


async def _save_douyin_qrcode(page, account_file: str, previous_qrcode_path: Path | None = None, qrcode_callback=None) -> dict:
    qrcode_src = await _extract_douyin_qrcode_src(page)
    qrcode_path = save_data_url_image(qrcode_src, build_login_qrcode_path(account_file))
    if previous_qrcode_path and previous_qrcode_path != qrcode_path:
        remove_qrcode_file(previous_qrcode_path)

    qrcode_content = decode_qrcode_from_path(qrcode_path)
    if qrcode_content:
        print_terminal_qrcode(qrcode_content, qrcode_path, "抖音APP")

    qrcode_info = {
        "image_path": str(qrcode_path),
        "image_data_url": qrcode_src,
        "content": qrcode_content,
        "verification_url": qrcode_content if qrcode_content and qrcode_content.startswith(("http://", "https://")) else None,
    }
    await _emit_qrcode_callback(qrcode_callback, qrcode_info)
    return qrcode_info


async def _is_douyin_login_completed(page) -> bool:
    if not page.url.startswith("https://creator.douyin.com/creator-micro/"):
        return False

    login_markers = [
        page.get_by_text("扫码登录", exact=True).first,
        page.get_by_text("手机号登录", exact=True).first,
        page.get_by_text("二维码失效", exact=True).first,
        page.get_by_role("img", name="二维码").first,
    ]

    for marker in login_markers:
        if not await marker.count():
            continue
        try:
            if await marker.is_visible():
                return False
        except Exception:
            continue

    return True


async def _extract_logged_in_account_name(page) -> str:
    selectors = [
        '[class*="user"] [class*="name"]',
        '[class*="account"] [class*="name"]',
        '[class*="avatar"] + span',
        'header [class*="name"]',
        'aside [class*="name"]',
    ]

    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if not await locator.count():
                continue
            text = (await locator.text_content() or "").strip()
            if text and "登录" not in text and "扫码" not in text:
                lowered = text.lower()
                if any(token in text for token in GENERIC_ACCOUNT_NAME_TOKENS) or any(token in lowered for token in GENERIC_ACCOUNT_NAME_TOKENS):
                    continue
                return text
        except Exception:
            continue

    try:
        title = (await page.title()).strip()
        if title:
            normalized_title = title.replace("抖音", " ").replace("创作者服务平台", " ").replace("|", " ").replace("-", " ")
            candidate = " ".join(part for part in normalized_title.split() if part and "登录" not in part)
            if candidate:
                lowered = candidate.lower()
                if any(token in candidate for token in GENERIC_ACCOUNT_NAME_TOKENS) or any(token in lowered for token in GENERIC_ACCOUNT_NAME_TOKENS):
                    return ""
                return candidate[:64]
    except Exception:
        pass

    return ""


async def _wait_for_douyin_login(page, account_file: str, qrcode_info: dict, qrcode_callback=None, poll_interval: int = 3, max_checks: int = 100) -> dict:
    qrcode_path = Path(qrcode_info["image_path"])
    for _ in range(max_checks):
        if await _is_douyin_login_completed(page):
            return _build_login_result(True, "success", "抖音扫码登录成功", account_file, qrcode_info, page.url)

        expired_box = page.get_by_text("二维码失效", exact=True).locator("..").first
        if await expired_box.count() and await expired_box.is_visible():
            await expired_box.click()
            await asyncio.sleep(1)
            qrcode_info = await _save_douyin_qrcode(page, account_file, qrcode_path, qrcode_callback=qrcode_callback)
            qrcode_path = Path(qrcode_info["image_path"])

        await asyncio.sleep(poll_interval)

    return _build_login_result(False, "timeout", "等待抖音扫码登录超时", account_file, qrcode_info, page.url)


async def douyin_cookie_gen(
    account_file,
    qrcode_callback: Callable[[dict[str, Any]], Any] | None = None,
    poll_interval: int = 3,
    max_checks: int = 100,
    headless: bool = True,
):
    async_playwright = _resolve_async_playwright()
    async with async_playwright() as playwright:
        browser = await launch_chromium(playwright, headless=headless)
        context = await browser.new_context()
        context = await set_init_script(context)
        qrcode_path = None
        result = _build_login_result(False, "failed", "抖音登录失败", account_file)
        try:
            page = await context.new_page()
            await page.goto("https://creator.douyin.com/")
            qrcode_info = await _save_douyin_qrcode(page, account_file, qrcode_callback=qrcode_callback)
            qrcode_path = Path(qrcode_info["image_path"])
            result = await _wait_for_douyin_login(
                page,
                account_file,
                qrcode_info,
                qrcode_callback=qrcode_callback,
                poll_interval=poll_interval,
                max_checks=max_checks,
            )
            if result["success"]:
                result["account_name"] = result.get("account_name") or await _extract_logged_in_account_name(page)
                await asyncio.sleep(2)
                await context.storage_state(path=account_file)
                if not await _validate_saved_cookie(account_file, headless=headless):
                    result = _build_login_result(
                        False,
                        "cookie_invalid",
                        "抖音扫码流程结束，但 cookie 校验失败（可能触发风控二次验证，请稍后重试或重新扫码）",
                        account_file,
                        qrcode_info,
                        page.url,
                    )
        except Exception as exc:
            result = _build_login_result(False, "failed", str(exc), account_file)
        finally:
            remove_qrcode_file(qrcode_path)
            await context.close()
            await browser.close()
        return result


class DouYinVideo(BaseVideoUploader):
    def __init__(
        self,
        title,
        file_path,
        tags,
        publish_date: datetime | int,
        account_file,
        desc: str | None = None,
        publish_strategy: str = DOUYIN_PUBLISH_STRATEGY_IMMEDIATE,
        headless: bool = True,
    ):
        self.publish_date = publish_date
        self.account_file = account_file
        self.publish_strategy = publish_strategy
        self.headless = headless
        self.title = title
        self.file_path = file_path
        self.tags = tags
        self.desc = desc or ""

    async def validate_upload_args(self):
        if not os.path.exists(self.account_file):
            raise RuntimeError(f"cookie文件不存在，请先完成抖音登录: {self.account_file}")
        if not await cookie_auth_with_mode(self.account_file, headless=self.headless):
            raise RuntimeError(f"cookie文件已失效，请先完成抖音登录: {self.account_file}")
        if self.publish_strategy not in {DOUYIN_PUBLISH_STRATEGY_IMMEDIATE, DOUYIN_PUBLISH_STRATEGY_SCHEDULED}:
            raise ValueError(f"不支持的发布策略: {self.publish_strategy}")

        if self.publish_strategy == DOUYIN_PUBLISH_STRATEGY_SCHEDULED:
            self.publish_date = self.validate_publish_date(self.publish_date)
        else:
            self.publish_date = 0

        if not self.title or not str(self.title).strip():
            raise ValueError("视频模式下，title 是必须的")

        self.file_path = str(self.validate_video_file(self.file_path))

    async def set_schedule_time_douyin(self, page, publish_date):
        label_element = page.locator("[class^='radio']:has-text('定时发布')")
        await label_element.click()
        await asyncio.sleep(1)
        publish_date_hour = publish_date.strftime("%Y-%m-%d %H:%M")

        await asyncio.sleep(1)
        await page.locator('.semi-input[placeholder="日期和时间"]').click()
        await page.keyboard.press("Control+KeyA")
        await page.keyboard.type(str(publish_date_hour))
        await page.keyboard.press("Enter")
        await asyncio.sleep(1)

    async def fill_title_and_description(self, page, title: str, description: str, tags: list[str] | None = None):
        description_section = (
            page.get_by_text("作品描述", exact=True)
            .locator("xpath=ancestor::div[2]")
            .locator("xpath=following-sibling::div[1]")
        )

        title_input = description_section.locator('input[type="text"]').first
        await title_input.wait_for(state="visible", timeout=10000)
        await title_input.fill(title[:30])

        description_editor = description_section.locator('.zone-container[contenteditable="true"]').first
        await description_editor.wait_for(state="visible", timeout=10000)
        await description_editor.click()
        await page.keyboard.press("Control+KeyA")
        await page.keyboard.press("Delete")
        await page.keyboard.type(description)

        for tag in tags or []:
            await page.keyboard.type(" #" + tag)
            await page.keyboard.press("Space")

    async def upload(self) -> None:
        await self.validate_upload_args()

        async_playwright = _resolve_async_playwright()
        async with async_playwright() as playwright:
            browser = await launch_chromium(playwright, headless=self.headless)
            context = await browser.new_context(
                storage_state=f"{self.account_file}",
                permissions=["geolocation"],
            )
            context = await set_init_script(context)

            page = await context.new_page()
            await page.goto("https://creator.douyin.com/creator-micro/content/upload")
            await page.wait_for_url("**/creator-micro/content/upload**")
            file_input = page.locator('input[type="file"]').first
            if not await file_input.count():
                raise RuntimeError("未找到抖音上传入口，可能登录态已失效，请重新扫码登录")
            await file_input.set_input_files(self.file_path)

            while True:
                try:
                    await page.wait_for_url(
                        "https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page",
                        timeout=3000,
                    )
                    break
                except Exception:
                    try:
                        await page.wait_for_url(
                            "https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page",
                            timeout=3000,
                        )
                        break
                    except Exception:
                        await asyncio.sleep(0.5)

            await asyncio.sleep(1)
            await self.fill_title_and_description(page, self.title, self.desc or self.title, self.tags)

            while True:
                try:
                    number = await page.locator('[class^="long-card"] div:has-text("重新上传")').count()
                    if number > 0:
                        break
                    await asyncio.sleep(2)
                except Exception:
                    await asyncio.sleep(2)

            if self.publish_strategy == DOUYIN_PUBLISH_STRATEGY_SCHEDULED and self.publish_date != 0:
                await self.set_schedule_time_douyin(page, self.publish_date)

            while True:
                try:
                    publish_button = page.get_by_role("button", name="发布", exact=True)
                    if await publish_button.count():
                        await publish_button.click()
                    await page.wait_for_url(
                        "https://creator.douyin.com/creator-micro/content/manage**",
                        timeout=5000,
                    )
                    break
                except Exception:
                    await asyncio.sleep(0.5)

            await context.storage_state(path=self.account_file)
            await asyncio.sleep(1)
            await context.close()
            await browser.close()


async def upload_video(request: DouyinVideoUploadRequest) -> Path:
    account_file = resolve_account_file("douyin", request.account_name)
    is_ready = await douyin_setup(str(account_file), handle=False, headless=request.headless)
    if not is_ready:
        raise RuntimeError(
            f"Douyin cookie is missing or expired: {account_file}. 请先完成扫码登录。"
        )

    app = DouYinVideo(
        request.title,
        str(request.video_file),
        request.tags,
        request.publish_date,
        str(account_file),
        desc=request.description,
        publish_strategy=request.publish_strategy,
        headless=request.headless,
    )
    await app.upload()
    return account_file
