const FALLBACK_COVER = '/images/default-dish.png';
const imageCache = require('../../services/imageCache');

Component({
  properties: {
    item: {
      type: Object,
      value: {},
      observer(item) {
        imageCache.setImageData(this, { cover: item && (item.cover || item.image) || '' });
      },
    },
    showPrice: { type: Boolean, value: true },
    fullSummary: { type: Boolean, value: false },
  },
  data: { cover: '', displayCover: FALLBACK_COVER },
  lifetimes: {
    detached() { imageCache.releaseView(this); },
  },
  methods: {
    ...imageCache.imageEventHandlers,
    onImageError(event) {
      imageCache.handleImageError(this, this.data.cover, FALLBACK_COVER, event && event.currentTarget.dataset.src);
    },
  },
});
