from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user
from app.core.database import get_db
from app.models.session import Session as SessionModel
from app.models.user import User
from app.schemas.session import (
    SessionCreateRequest,
    SessionCreateResponse,
    SessionData,
    SessionDeleteResponse,
    SessionListResponse,
    SessionResponse,
    SessionUpdateRequest,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def generate_session_id() -> str:
    return f"session-{uuid4().hex}"


def get_owned_session(
    session_id: str,
    current_user: User,
    db: Session,
) -> SessionModel:
    """只允许取得当前用户拥有的 session。"""
    session = (
        db.query(SessionModel)
        .filter(
            SessionModel.session_id == session_id,
            SessionModel.user_id == current_user.id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    return session


def to_session_data(session: SessionModel) -> SessionData:
    return SessionData(
        session_id=session.session_id,
        scenario_id=session.scenario_id,
        language=session.language,
        status=session.status,
    )


@router.post(
    "",
    response_model=SessionCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    request: SessionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_session = SessionModel(
        session_id=generate_session_id(),
        user_id=current_user.id,
        scenario_id=request.scenario_id,
        language=request.language,
        status="active",
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return SessionCreateResponse(
        success=True,
        data=to_session_data(new_session),
        error=None,
    )


# 1. 列表查询：只返回当前用户的 sessions
@router.get("", response_model=SessionListResponse)
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = (
        db.query(SessionModel)
        .filter(SessionModel.user_id == current_user.id)
        .order_by(SessionModel.id.desc())
        .all()
    )

    return SessionListResponse(
        success=True,
        data=[to_session_data(item) for item in sessions],
        error=None,
    )


# 2. 单笔查询
@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(session_id, current_user, db)

    return SessionResponse(
        success=True,
        data=to_session_data(session),
        error=None,
    )


# 3. 更新：只能修改自己的 session
@router.patch("/{session_id}", response_model=SessionResponse)
def update_session(
    session_id: str,
    request: SessionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updates = request.model_dump(exclude_unset=True, exclude_none=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided",
        )

    session = get_owned_session(session_id, current_user, db)

    for field, value in updates.items():
        setattr(session, field, value)

    db.commit()
    db.refresh(session)

    return SessionResponse(
        success=True,
        data=to_session_data(session),
        error=None,
    )


# 4. 删除：只能删除自己的 session
@router.delete("/{session_id}", response_model=SessionDeleteResponse)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(session_id, current_user, db)
    deleted_id = session.session_id

    db.delete(session)
    db.commit()

    return SessionDeleteResponse(
        success=True,
        data={
            "session_id": deleted_id,
            "deleted": True,
        },
        error=None,
    )
