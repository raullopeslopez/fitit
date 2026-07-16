from fastapi import APIRouter, HTTPException, status

from ..auth import create_access_token, verify_credentials
from ..schemas import LoginIn, TokenOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn) -> TokenOut:
    if not verify_credentials(payload.username, payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials"
        )
    return TokenOut(access_token=create_access_token(payload.username))
