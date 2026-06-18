const express = require('express');
const { TikTokScraper } = require('tiktok-scraper-ts');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/user/:username/videos', async (req, res) => {
  try {
    const username = req.params.username;
    const scraper = new TikTokScraper();
    const videos = await scraper.getUserVideos(username, 50);

    const formatted = videos.collector.map(v => ({
      id: v.id,
      description: v.text,
      createTime: v.createTime,
      playCount: v.playCount,
      diggCount: v.diggCount,
      commentCount: v.commentCount,
      shareCount: v.shareCount,
      videoUrl: v.videoUrl,
      cover: v.covers?.default || v.covers?.origin,
      duration: v.videoDuration,
      width: v.videoWidth,
      height: v.videoHeight,
      hashtags: v.hashtags?.map(h => h.name) || []
    }));

    const sorted = formatted.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
    res.json({ success: true, videos: sorted, count: sorted.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
