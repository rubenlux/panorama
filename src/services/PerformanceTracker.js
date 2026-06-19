/**
 * PerformanceTracker — Centralizes metrics for different modules.
 */
class PerformanceTracker {
  constructor() {
    this.news = {
      pagesOpened: 0,
      browsersLaunched: 0,
      totalTime: 0
    };
    this.social = {
      pagesOpened: 0,
      browsersLaunched: 0,
      totalTime: 0,
      platforms: {
        facebook: { duration: 0, found: 0, saved: 0 },
        instagram: { duration: 0, found: 0, saved: 0 },
        youtube_posts: { duration: 0, found: 0, saved: 0 },
        youtube_videos: { duration: 0, found: 0, saved: 0 },
        youtube_shorts: { duration: 0, found: 0, saved: 0 },
        x: { duration: 0, found: 0, saved: 0 }
      }
    };
  }

  resetSocial() {
    this.social.pagesOpened = 0;
    this.social.browsersLaunched = 0;
    this.social.totalTime = 0;
    for (const key in this.social.platforms) {
      this.social.platforms[key] = { duration: 0, found: 0, saved: 0 };
    }
  }

  trackSocialPlatform(platform, duration, found, saved) {
    if (this.social.platforms[platform]) {
      this.social.platforms[platform].duration += duration;
      this.social.platforms[platform].found += found;
      this.social.platforms[platform].saved += saved;
    }
  }
}

export const perfTracker = new PerformanceTracker();
