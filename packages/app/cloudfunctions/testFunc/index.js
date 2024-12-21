// 云函数入口文件
const cloud = require("wx-server-sdk");
const express = require("wx-express-server");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  const app = await express.initExpressApp();
  app.get("/hello", (req, res) => {
    res.send({ message: "Hello from Express in a WeChat Cloud Function!" });
  });

  return express.expressWXServer({
    event,
    context,
    wxContext,
    app,
  });
};
