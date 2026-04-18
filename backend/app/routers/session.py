from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.supabase_client import supabase_client
from app.services import conversation_agent
from app.services import group_conversation_manager

logger = logging.getLogger(__name__)

router = APIRouter()


async def _validate_jwt_ws(token: str) -> bool:
    """Validate a JWT token via Supabase. Returns True if valid, False otherwise."""
    try:
        response = supabase_client.auth.get_user(token)
        return response is not None and response.user is not None
    except Exception as exc:
        logger.warning("WebSocket JWT validation error: %s", exc)
        return False


@router.websocket("/ws/session")
async def session_ws(
    websocket: WebSocket,
    profileId: str | None = None,
    profileIds: str | None = None,
    token: str | None = None,
) -> None:
    """WebSocket endpoint for a voice conversation session.

    Supports both single and group sessions:
    - Single: ?profileId=<id>
    - Group: ?profileIds=<id1,id2,...> (max 5, comma-separated)

    JWT can be supplied via:
    - `token` query parameter, OR
    - First text message received after connection

    Closes with code 4001 on invalid/missing JWT.
    """
    try:
        # Determine if this is a group session
        if profileIds:
            profile_id_list = [pid.strip() for pid in profileIds.split(",") if pid.strip()]
            is_group = len(profile_id_list) > 1
        else:
            profile_id_list = [profileId] if profileId else []
            is_group = False

        if not profile_id_list:
            await websocket.accept()
            await websocket.close(code=1008)  # Policy violation
            return

        # JWT validation
        if token:
            valid = await _validate_jwt_ws(token)
            if not valid:
                await websocket.close(code=4001)
                return
            
            # Delegate to appropriate handler
            if is_group:
                await group_conversation_manager.run_group_session(websocket, profile_id_list)
            else:
                await conversation_agent.run_session(websocket, profile_id_list[0])
        else:
            await websocket.accept()
            try:
                first_msg = await websocket.receive_text()
            except WebSocketDisconnect:
                return

            valid = await _validate_jwt_ws(first_msg.strip())
            if not valid:
                await websocket.close(code=4001)
                return

            # Delegate to appropriate handler
            if is_group:
                await group_conversation_manager.run_group_session(websocket, profile_id_list)
            else:
                await conversation_agent.run_session(websocket, profile_id_list[0])

    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected")
    except Exception:
        logger.exception("Unexpected error in /ws/session")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
