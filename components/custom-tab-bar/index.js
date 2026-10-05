const orderService = require('../../services/orders');
const chefOrderReminder = require('../../services/chef-order-reminder');

Component({
  data: {
    selected: 0,
    openOrderBadge: '',
    color: '#A89684',
    selectedColor: '#6F472D',
    backgroundColor: '#FFFCF7',
    list: [
      {
        key: 'home',
        pagePath: '/pages/menu/menu',
        text: '首页',
        icon: 'menu',
      },
      {
        key: 'catalog',
        pagePath: '/pages/menu/menu',
        text: '点餐',
        icon: 'catalog',
      },
      {
        key: 'profile',
        pagePath: '/pages/profile/profile',
        text: '我的',
        icon: 'profile',
      },
    ],
  },

  lifetimes: {
    attached() {
      this._detached = false;
      this._customerOrderCount = 0;
      this._customerOrderIds = [];
      this._chefPendingCount = 0;
      this._chefPendingIds = [];
      this._unsubscribeChefBadge = chefOrderReminder.subscribe(reminderState => {
        if (this._detached) return;
        this._chefPendingCount = reminderState.pendingCount;
        this._chefPendingIds = reminderState.pendingOrderIds;
        this.updateCombinedBadge();
      });
      this._selectTimer = setTimeout(() => this.syncSelected(), 100);
      this.refreshOrderBadge();
    },
    detached() {
      this._detached = true;
      clearTimeout(this._selectTimer);
      if (this._unsubscribeChefBadge) this._unsubscribeChefBadge();
    },
  },

  pageLifetimes: {
    show() {
      this.syncSelected();
      this.refreshOrderBadge();
      const app = getApp();
      if (app.globalData && app.globalData.isAdmin) chefOrderReminder.start();
    },
  },

  methods: {
    syncSelected() {
      this.setData({ selected: this.getTabBarSelected() });
    },

    async refreshOrderBadge() {
      if (this._badgeRequest) return this._badgeRequest;
      this._badgeRequest = orderService.listMyUnfinishedOrderSummary();
      try {
        const summary = await this._badgeRequest;
        if (!this._detached) {
          this._customerOrderCount = Number(summary.count) || 0;
          this._customerOrderIds = Array.isArray(summary.orderIds) ? summary.orderIds : [];
          const badge = chefOrderReminder.formatBadge(this._customerOrderCount);
          this.updateCombinedBadge();
          this.triggerEvent('orderbadgechange', { badge, count: this._customerOrderCount });
        }
      } catch (_) {
        if (!this._detached) {
          this._customerOrderCount = 0;
          this._customerOrderIds = [];
          this.updateCombinedBadge();
          this.triggerEvent('orderbadgechange', { badge: '' });
        }
      } finally {
        this._badgeRequest = null;
      }
    },

    updateCombinedBadge() {
      if (this._detached) return;
      const customerCount = this._customerOrderCount || 0;
      const chefCount = this._chefPendingCount || 0;
      let combinedCount = customerCount + chefCount;
      if (this._customerOrderIds.length === customerCount && this._chefPendingIds.length === chefCount) {
        combinedCount = new Set([...this._customerOrderIds, ...this._chefPendingIds].map(String)).size;
      }
      this.setData({ openOrderBadge: chefOrderReminder.formatBadge(combinedCount) });
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item) return;
      if (index < 2) {
        const viewMode = index === 1 ? 'menu' : 'home';
        const pages = getCurrentPages();
        const currentPage = pages && pages[pages.length - 1];
        const route = currentPage && String(currentPage.route || currentPage.__route__ || '').replace(/^\//, '');
        if (route === 'pages/menu/menu') {
          currentPage.setData({ viewMode });
          this.setData({ selected: index });
          return;
        }
        getApp().globalData.menuTabView = viewMode;
      }
      wx.switchTab({ url: item.pagePath });
    },

    getTabBarSelected() {
      const pages = getCurrentPages();
      const currentPage = pages && pages[pages.length - 1];
      if (!currentPage) return 0;
      const route = String(currentPage.route || currentPage.__route__ || '').replace(/^\//, '');
      if (route === 'pages/profile/profile') return 2;
      if (route === 'pages/menu/menu' && currentPage.data && currentPage.data.viewMode === 'menu') return 1;
      return 0;
    },
  },
});
