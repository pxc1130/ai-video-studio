export interface ParsedProductInfo {
  productName: string;
  price: string;
  category: string;
  scriptTemplate: string;
  autoFilledFields: string[];
}

function inferCategoryFromData(data: any): string {
  const textToCheck = JSON.stringify(data).toLowerCase();
  if (textToCheck.includes('鞋') || textToCheck.includes('shoe') || textToCheck.includes('sneaker') || textToCheck.includes('boot')) {
    return 'shoes';
  }
  if (textToCheck.includes('服装') || textToCheck.includes('衣') || textToCheck.includes('apparel') || textToCheck.includes('shirt') || textToCheck.includes('jacket')) {
    return 'apparel';
  }
  if (textToCheck.includes('户外') || textToCheck.includes('露营') || textToCheck.includes('运动户外') || textToCheck.includes('outdoor') || textToCheck.includes('camp') || textToCheck.includes('gear')) {
    return 'outdoor_gear';
  }
  return 'default';
}

function extractTitle(data: any): string {
  if (typeof data !== 'object' || data === null) return '';
  // Try common paths
  const item = data.item || data;
  return item?.title || data?.title || '';
}

function extractPrice(data: any): string {
  if (typeof data !== 'object' || data === null) return '';
  const item = data.item || data;
  const raw = item?.price || data?.price || '';
  if (!raw) return '';
  const str = String(raw).trim();
  // Remove currency symbols, keep number
  const match = str.match(/[\d,]+\.?\d*/);
  return match ? match[0].replace(/,/g, '') : str;
}

export async function parseProductFiles(files: FileList): Promise<{
  images: File[];
  descFile: File | null;
  info: ParsedProductInfo;
}> {
  const allFiles = Array.from(files);
  const images = allFiles.filter(f => f.type.startsWith('image/'));

  // Priority: description.txt > summary.json > meta.json
  const descTxt = allFiles.find(f => f.name.toLowerCase() === 'description.txt');
  const summaryJson = allFiles.find(f => f.name.toLowerCase() === 'summary.json');
  const metaJson = allFiles.find(f => f.name.toLowerCase() === 'meta.json');
  const descFile = descTxt || summaryJson || metaJson || null;

  const info: ParsedProductInfo = {
    productName: '',
    price: '',
    category: 'outdoor_gear',
    scriptTemplate: '',
    autoFilledFields: [],
  };

  if (descFile) {
    const ext = descFile.name.split('.').pop()?.toLowerCase();
    try {
      const text = await descFile.text();
      let data: any = null;
      if (ext === 'json') {
        try {
          data = JSON.parse(text);
        } catch {
          // ignore parse error
        }
      }

      if (data && typeof data === 'object') {
        const title = extractTitle(data);
        if (title) {
          info.productName = title;
          info.autoFilledFields.push('商品名称');
        }
        const price = extractPrice(data);
        if (price) {
          info.price = price;
          info.autoFilledFields.push('价格');
        }
        const cat = inferCategoryFromData(data);
        if (cat) {
          info.category = cat;
          info.autoFilledFields.push('类目');
        }
      } else if (ext === 'txt' || ext === 'md') {
        // Light rule-based extraction for plain text
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const titleMatch = line.match(/(?:标题|商品名称|title)[：:]\s*(.+)/i);
          if (titleMatch && !info.productName) {
            info.productName = titleMatch[1].trim();
            info.autoFilledFields.push('商品名称');
          }
          const priceMatch = line.match(/(?:价格|售价|price)[：:]\s*[$¥]?\s*([\d,.]+)/i);
          if (priceMatch && !info.price) {
            info.price = priceMatch[1].replace(/,/g, '');
            info.autoFilledFields.push('价格');
          }
        }
        if (!info.category) {
          info.category = inferCategoryFromData({ rawText: text });
          info.autoFilledFields.push('类目');
        }
      }
    } catch {
      // ignore read errors
    }
  }

  // If no category inferred from JSON, fallback to general inference
  if (!info.autoFilledFields.includes('类目') && descFile) {
    info.category = inferCategoryFromData(await descFile.text().catch(() => ''));
    info.autoFilledFields.push('类目');
  }

  return { images, descFile, info };
}
