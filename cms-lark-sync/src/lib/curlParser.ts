export function parseCurl(curl: string) {
  const urlMatch = curl.match(/curl ['"](.+?)['"]/);
  if (!urlMatch) throw new Error('Không tìm thấy URL');

  const headers: Record<string, string> = {};
  const headerRegex = /-H ['"](.+?):\s*(.+?)['"]/g;

  let match;
  while ((match = headerRegex.exec(curl))) {
    headers[match[1]] = match[2];
  }

  return {
    url: urlMatch[1],
    headers,
  };
}
