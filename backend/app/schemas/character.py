from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CharacterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role_type: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    personality: Optional[str] = None
    background: Optional[str] = None


class CharacterUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    role_type: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    personality: Optional[str] = None
    background: Optional[str] = None


class CharacterResponse(BaseModel):
    id: uuid.UUID
    name: str
    role_type: Optional[str]
    description: Optional[str]
    personality: Optional[str]
    background: Optional[str]
    avatar: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CharacterRelationCreate(BaseModel):
    from_character_id: uuid.UUID
    to_character_id: uuid.UUID
    relation_type: str = Field(..., max_length=50)
    description: Optional[str] = None


class CharacterRelationResponse(BaseModel):
    id: uuid.UUID
    from_character_id: uuid.UUID
    to_character_id: uuid.UUID
    relation_type: str
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
