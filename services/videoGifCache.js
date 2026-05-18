const videoGifCache = new Map();

function rememberVideoGif(videoUrl, gifUrl) {
  if (!videoUrl || !gifUrl) return;

  videoGifCache.set(videoUrl, gifUrl);

  setTimeout(() => {
    videoGifCache.delete(videoUrl);
  }, 30 * 60 * 1000);
}

function findGifByVideoUrl(videoUrl) {
  if (!videoUrl) return null;
  return videoGifCache.get(videoUrl) || null;
}

module.exports = {
  rememberVideoGif,
  findGifByVideoUrl,
};
