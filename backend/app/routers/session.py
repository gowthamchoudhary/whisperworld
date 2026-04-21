from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services import conversation_agent
from app.services import group_conversation_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/session")
async def session_ws(
    websocket: WebSocket,
    profileId: str | None = None,
    profileIds: str | None = None,
) -> None:
    """WebSocket endpoint for a voice conversation session.

    Supports both single and group sessions:
    - Single: ?profileId=<id>
    - Group: ?profileIds=<id1,id2,...> (max 5, comma-separated)

    No authentication required - open access.
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

        # Accept connection and delegate to appropriate handler
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
