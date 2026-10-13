using Microsoft.AspNetCore.Mvc;

namespace 手語.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        // 模擬簡單的使用者資料庫（記憶體快取，重啟後會還原）
        private static readonly List<UserItem> UserDatabase = new List<UserItem>
        {
            new UserItem { Email = "test@example.com", Password = "123456", Name = "聽障防護專員" }
        };

        public class UserItem
        {
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
        }

        public class LoginModel
        {
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        public class RegisterModel
        {
            public string Email { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
        }

        // 1. 登入 API
        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginModel model)
        {
            var user = UserDatabase.FirstOrDefault(u => u.Email == model.Email && u.Password == model.Password);

            if (user != null)
            {
                return Ok(new
                {
                    status = "success",
                    message = "登入成功！",
                    token = "mock-jwt-token-" + Guid.NewGuid().ToString("N"),
                    user = new
                    {
                        email = user.Email,
                        name = user.Name
                    }
                });
            }

            return Unauthorized(new { status = "error", message = "帳號或密碼錯誤！" });
        }

        // 2. 註冊 API
        [HttpPost("register")]
        public IActionResult Register([FromBody] RegisterModel model)
        {
            if (string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Password))
            {
                return BadRequest(new { status = "error", message = "帳號與密碼不能為空！" });
            }

            // 檢查 Email 是否已被註冊
            if (UserDatabase.Any(u => u.Email == model.Email))
            {
                return BadRequest(new { status = "error", message = "此 Email 已經被註冊過囉！" });
            }

            // 新增使用者
            var newUser = new UserItem
            {
                Email = model.Email,
                Password = model.Password,
                Name = string.IsNullOrEmpty(model.Name) ? model.Email.Split('@')[0] : model.Name
            };

            UserDatabase.Add(newUser);

            return Ok(new
            {
                status = "success",
                message = "註冊成功！請直接登入。",
                user = new
                {
                    email = newUser.Email,
                    name = newUser.Name
                }
            });
        }
    }
}