var builder = WebApplication.CreateBuilder(args);

// 1. 新增 API 控制器與 CORS 服務
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// 💡 開放 CORS 允許前端網頁呼叫 API
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

// 💡 啟用 CORS 政策
app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers();

app.Run();