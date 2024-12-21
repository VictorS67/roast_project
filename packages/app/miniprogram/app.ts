// app.ts
App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        console.log(res.code)
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      },
    })

    if (!wx.cloud) {
      console.error('Please use wechat base library 2.2.3 or above to use cloud capability')
    } else {
      wx.cloud.init({
        env: 'flip-test-env-4gice6ydb47357cc', // Replace with your actual env ID, or use cloud.DYNAMIC_CURRENT_ENV
        traceUser: true,
      })
      console.log('cloud is init')
    }
  },
})