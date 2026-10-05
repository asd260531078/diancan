const decoration = require('../../config/home-decoration');

Component({
  data: { decoration, pageVisible: true },
  pageLifetimes: {
    show() { this.setData({ pageVisible: true }); },
    hide() { this.setData({ pageVisible: false }); },
  },
  methods: {
    welcome() {
      wx.showToast({ title: this.data.decoration.greeting, icon: 'none', duration: 1400 });
    },
  },
});
