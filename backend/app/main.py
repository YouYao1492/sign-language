from fastapi import FastAPI
from app.routers import recognize
from app.core.responses import register_exception_handlers
from fastapi.middleware.cors import CORSMiddleware



from app.routers.auth import router as auth_router
from app.routers.sessions import router as sessions_router

app = FastAPI(
    title="Sign Language",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(sessions_router)
# 放在 app = FastAPI(...) 之後
register_exception_handlers(app)
app.include_router(recognize.router)


@app.get("/api/health")
def health_check():
    return {
        "success": True,
        "data": {
            "status": "ok",
        },
        "error": None,
    }
