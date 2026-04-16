import { test, expect } from '@playwright/test'

test('homepage renders and can switch to align stage', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText(/AI 视频工坊|AI 瑙嗛宸ュ潑/)).toBeVisible()
  await page.getByRole('button', { name: /新建项目|鏂板缓椤圭洰/ }).first().click()

  await expect(page.getByRole('button', { name: /素材规划|绱犳潗瑙勫垝/ })).toBeVisible()
  await page.getByRole('button', { name: /音画对齐|闊崇敾瀵归綈/ }).click()

  await expect(page.getByRole('heading', { name: /音画对齐|闊崇敾瀵归綈/ })).toBeVisible()
  await expect(page.getByText('BGM', { exact: true })).toBeVisible()
})
