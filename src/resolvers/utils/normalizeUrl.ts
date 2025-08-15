function isValidUrl(input: string): boolean {
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(inputUrl:string):string {
  if (!isValidUrl(inputUrl)){
      throw new Error("Invalid URL, please enter a valid web address.");
  }
  try {
  
    const url = new URL(inputUrl); // will add "/" in the end if url is root, fill the url's "pathname" 

    url.hostname = url.hostname.toLowerCase(); // pathname 則會區分大小寫，所以不做轉換

    // 2. 移除尾斜線（根路徑除外）。 根目錄正規化的結果統一都是帶斜線的 : https://github.com/
    if (url.pathname.endsWith('/') && url.pathname !== '/') {
      url.pathname = url.pathname.slice(0, -1);
    }

    // 3. 不想刪掉使用者在使用過程中產生的網址參數，比如填表單填到一半，想傳給別人繼續填的那種狀況。 
    // 所以預計只把常見追蹤參數，用下面的 set 給過濾掉。
    const trackingParams = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'ref',
      'ref_src'
    ]);

    for (const param of [...url.searchParams.keys()]) {
      if (trackingParams.has(param.toLowerCase())) {
        url.searchParams.delete(param);
      }
    }

    return url.toString();

  } catch (err) {
    console.error('Invalid URL:', inputUrl);
    return inputUrl; // 無效網址就原樣返回，還是允許使用者將 originalUrl 傳入 "cat"
  }
}
