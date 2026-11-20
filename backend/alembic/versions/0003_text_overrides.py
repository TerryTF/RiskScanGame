"""text overrides for the editor mode

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-20 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'text_overrides',
        sa.Column('key', sa.String(length=160), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('key', name=op.f('pk_text_overrides')),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('text_overrides')
