# AGENTS.md

## 项目绝对路径（每次用工具必须原样复制，禁止手打）

```
G:\Develope\polygonGlobe
```

- 拼错成 `G:\Devoke` 会凭空建出游离文件夹，已发生多次。
- 凡是工具的 `filePath` / `workdir` 参数，直接复制上面这行。
- 文件一律写在 `G:\Develope\polygonGlobe\` 内，任何情况下不得在 `G:\` 下创建新目录。

## 常用命令

- 构建: `npm run build`
- 打印测试: `node scripts\print-test.mjs`
- 启动: `Start-Process C:\nvm4w\nodejs\npx.cmd -ArgumentList 'vite','--port','5173','--strictPort','--host','127.0.0.1'`（日志 `temp\work\vite.log`）

## 约定

- 所有缓存写 `G:\Develope\polygonGlobe\temp\`，不写 C 盘。
- 用户自己做视觉验证: 给他 `http://127.0.0.1:5173/`，不要自己截图确认。
- 改动后跑 `npm run build` + `node scripts\print-test.mjs`。
