
export const parseYouTubeId = (url: string): string | null => {
  if (!url) return null;
  
  // Trả về trực tiếp nếu là chuỗi 11 ký tự (ID YouTube chuẩn)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  
  // Regex cải tiến để bắt ID từ youtu.be, youtube.com/watch, embed, v.v.
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  
  if (match && match[7] && match[7].length === 11) {
    return match[7];
  }
  
  // Trường hợp link rút gọn youtu.be/ID?params
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'youtu.be') {
      const id = urlObj.pathname.slice(1);
      if (id.length === 11) return id;
    }
  } catch (e) {}

  return null;
};
