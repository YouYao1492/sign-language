from fastapi import FastAPI

app = FastAPI(
    title="Sign Language",
    version="0.1.0",
)


@app.get("/api/health")
def health_check():
    return {
        "success": True,
        "data": {"status": "ok"},
        "error": None,
    }
