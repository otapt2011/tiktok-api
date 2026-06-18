const express = require('express');
const tiktok = require('@tobyg74/tiktok-api-dl');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/user/:username/videos', async (req, res) => {
  try {
    const username = req.params.username;

    // Fetch user profile & feed (this returns an array of videos with stats)
    const result = await tiktok.getUserFeed(username, { count: 30 });
    if (!result || !Array.isArray(result)) {
      throw new Error('No videos returned or invalid response');
    }

    // Format the data
    const videos = result.map(v => ({
      id: v.video_id,
      description: v.desc || v.description,
      createTime: v.create_time,
      playCount: v.stats?.playCount || v.stats?.play_count,
      diggCount: v.stats?.diggCount || v.stats?.digg_count,
      commentCount: v.stats?.commentCount || v.stats?.comment_count,
      shareCount: v.stats?.shareCount || v.stats?.share_count,
      videoUrl: v.download?.nowm || v.video?.download_addr,
      cover: v.cover || v.dynamic_cover,
      duration: v.duration,
      width: v.width,
      height: v.height,
      hashtags: v.hashtags || []
    }));

    // Sort by play count – most popular first
    const sorted = videos.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));

    res.json({ success: true, videos: sorted, count: sorted.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
