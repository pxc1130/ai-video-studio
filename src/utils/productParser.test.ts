import { describe, it, expect } from 'vitest';
import { parseProductFiles } from './productParser';

function createMockFileList(files: { name: string; type: string; text: string }[]): FileList {
  const fs = files.map(f => {
    const blob = new Blob([f.text], { type: f.type });
    const file = new File([blob], f.name, { type: f.type });
    // Ensure text() is available in test environment
    if (typeof (file as any).text !== 'function') {
      (file as any).text = () => Promise.resolve(f.text);
    }
    return file;
  });
  return fs as any;
}

describe('parseProductFiles', () => {
  it('extracts title, price, and category from meta.json', async () => {
    const json = JSON.stringify({
      item: {
        title: 'Outdoor Folding Knife',
        price: 22.7,
        props: [{ name: '运动户外项目', value: '露营' }],
      },
    });
    const files = createMockFileList([
      { name: 'meta.json', type: 'application/json', text: json },
      { name: 'main.jpg', type: 'image/jpeg', text: 'fake-image' },
    ]);
    const result = await parseProductFiles(files);
    expect(result.images.length).toBe(1);
    expect(result.descFile?.name).toBe('meta.json');
    expect(result.info.productName).toBe('Outdoor Folding Knife');
    expect(result.info.price).toBe('22.7');
    expect(result.info.category).toBe('outdoor_gear');
    expect(result.info.autoFilledFields).toContain('商品名称');
    expect(result.info.autoFilledFields).toContain('价格');
  });

  it('extracts from summary.json with flat structure', async () => {
    const json = JSON.stringify({
      title: 'Running Shoes',
      price: '59.99',
    });
    const files = createMockFileList([
      { name: 'summary.json', type: 'application/json', text: json },
    ]);
    const result = await parseProductFiles(files);
    expect(result.descFile?.name).toBe('summary.json');
    expect(result.info.productName).toBe('Running Shoes');
    expect(result.info.price).toBe('59.99');
    expect(result.info.category).toBe('shoes');
  });

  it('infers apparel category from clothing keywords', async () => {
    const json = JSON.stringify({
      item: { title: 'Windbreaker Jacket', price: 89 },
    });
    const files = createMockFileList([
      { name: 'meta.json', type: 'application/json', text: json },
    ]);
    const result = await parseProductFiles(files);
    expect(result.info.category).toBe('apparel');
  });

  it('parses title and price from plain text description.txt', async () => {
    const text = '标题: Camping Tent\n价格: $129.00\n';
    const files = createMockFileList([
      { name: 'description.txt', type: 'text/plain', text },
    ]);
    const result = await parseProductFiles(files);
    expect(result.descFile?.name).toBe('description.txt');
    expect(result.info.productName).toBe('Camping Tent');
    expect(result.info.price).toBe('129.00');
  });

  it('returns empty info when no description file is present', async () => {
    const files = createMockFileList([
      { name: 'main.jpg', type: 'image/jpeg', text: 'fake-image' },
    ]);
    const result = await parseProductFiles(files);
    expect(result.images.length).toBe(1);
    expect(result.descFile).toBeNull();
    expect(result.info.productName).toBe('');
  });
});
