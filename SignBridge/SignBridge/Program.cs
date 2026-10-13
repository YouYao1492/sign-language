var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseDefaultFiles();   // 網址 "/" 自動對應 wwwroot/index.html
app.UseStaticFiles();    // 提供 wwwroot 裡的檔案

// 診斷用：開啟 /_files 會列出伺服器實際讀到的 wwwroot 檔案
app.MapGet("/_files", (IWebHostEnvironment env) =>
    Results.Text(
        string.Join("\n", Directory.GetFiles(env.WebRootPath, "*", SearchOption.AllDirectories)
            .Select(f => Path.GetRelativePath(env.WebRootPath, f))),
        "text/plain; charset=utf-8"));

app.MapFallbackToFile("index.html");

app.Run();