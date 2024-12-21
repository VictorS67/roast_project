// index.ts
// 获取应用实例
const app = getApp<IAppOption>()
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Component({
  data: {
    motto: 'Hello World',
    userInfo: {
      avatarUrl: defaultAvatarUrl,
      nickName: '',
    },
    hasUserInfo: false,
    canIUseGetUserProfile: wx.canIUse('getUserProfile'),
    canIUseNicknameComp: wx.canIUse('input.type.nickname'),
  },
  methods: {
    // 事件处理函数
    bindViewTap() {
      wx.navigateTo({
        url: '../logs/logs',
      })
    },
    onChooseAvatar(e: any) {
      const { avatarUrl } = e.detail
      const { nickName } = this.data.userInfo
      this.setData({
        "userInfo.avatarUrl": avatarUrl,
        hasUserInfo: nickName && avatarUrl && avatarUrl !== defaultAvatarUrl,
      })
    },
    onInputChange(e: any) {
      const nickName = e.detail.value
      const { avatarUrl } = this.data.userInfo
      this.setData({
        "userInfo.nickName": nickName,
        hasUserInfo: nickName && avatarUrl && avatarUrl !== defaultAvatarUrl,
      })
    },
    getUserProfile() {
      // 推荐使用wx.getUserProfile获取用户信息，开发者每次通过该接口获取用户个人信息均需用户确认，开发者妥善保管用户快速填写的头像昵称，避免重复弹窗
      wx.getUserProfile({
        desc: '展示用户信息', // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
        success: (res) => {
          console.log(res)
          this.setData({
            userInfo: res.userInfo,
            hasUserInfo: true
          })
        }
      })
    },
    onLoad() {
      this.callExpressFunction();
    },
    callExpressFunction() {
      // Here we call the cloud function as if it was an HTTP endpoint.
      // The event object sent to the function simulates an HTTP request.
  
      wx.cloud.callFunction({
        name: 'testFunc', // The name of your deployed cloud function
        data: {
          // Simulate an incoming request. Adjust the shape as per your function code.
          path: '/hello',
          httpMethod: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          queryStringParameters: { foo: 'bar' },
          body: '' // For GET requests, usually no body is needed.
        }
      }).then(res => {
        console.log('Cloud function response:', res);
        // The structure of res.result depends on how the cloud function constructs it.
        // Based on the previous code, it should return something like:
        // { statusCode: 200, headers: {}, body: '{"message": "Hello...", "wxContext": {...}}' }
  
        let responseData = {};
        try {
          responseData = JSON.parse(res.result.body);
        } catch (e) {
          // If not JSON, just show raw data
          responseData = res.result.body;
        }
  
        this.setData({
          response: JSON.stringify(responseData, null, 2),
        })
      }).catch(err => {
        console.error('Cloud function call failed', err)
      });
    },
  },
})
