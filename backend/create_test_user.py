from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User

db = SessionLocal()

try:
    user = User(
        email="test@example.com",
        password_hash=hash_password("password123"),
        role="deaf",
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    print(f"Created user: {user.id} / {user.email}")

finally:
    db.close()
