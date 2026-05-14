# 发票 A4 排版打印

一个纯前端的发票、行程单和付款截图排版打印工具。支持把 PDF 或图片统一缩放后排到 A4 页面中，适合报销材料整理和批量打印。

## 在线访问

[https://invoice-printing.vercel.app](https://invoice-printing.vercel.app)

## 功能

- 支持上传 PDF、PNG、JPG/JPEG、WEBP。
- 支持多文件上传和拖拽上传。
- 支持 A4 横向、纵向打印。
- 支持自动排版，以及每页 1、2、4、6 张手动排版。
- 支持页面边距、发票间距、整体缩放调节。
- 支持显示票据框边界和发票间裁剪线。
- 付款截图等手机长图会在自动模式下按横向 A4 密集排版。

## 本地使用

这个项目不需要构建步骤，直接启动一个静态服务器即可：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:4173
```

也可以直接打开 `index.html`，但通过本地 HTTP 服务访问更接近线上环境。

## 隐私说明

上传的 PDF 和图片只在浏览器本地处理，不会上传到业务服务器、数据库或 Vercel 后端。当前页面使用 CDN 加载 `pdf.js`，CDN 只负责加载前端库文件，不接收用户选择的发票或截图内容。

如果需要更高隐私级别，可以把 `pdf.js` 相关文件下载到项目内并改成本地引用，完全移除运行时第三方 CDN 依赖。

## 部署

当前线上地址部署在 Vercel：

```text
https://invoice-printing.vercel.app
```

项目是静态站点，Vercel 会直接发布仓库根目录中的 `index.html`、`styles.css` 和 `app.js`。
