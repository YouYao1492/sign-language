from fastapi import FastAPI
from app.api import recognize
from app.core.responses import register_exception_handlers



app = FastAPI(
    title="Sign Language",
    version="0.1.0",
)

# 放在 app = FastAPI(...) 之後
register_exception_handlers(app)
app.include_router(recognize.router)


@app.get("/api/health")
def health_check():
    return {
        "success": True,
        "data": {"status": "ok"},
        "error": None,
    }
