"""geographic scope and Round 0 damage cap

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-20 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'games',
        sa.Column('geographic_scope', sa.String(length=120), server_default='Region', nullable=False),
    )
    op.add_column(
        'hazard_rolls',
        sa.Column('applied', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    # Before this revision every triggered hazard dealt its damage.
    op.execute(sa.text('UPDATE hazard_rolls SET applied = :yes WHERE triggered = :yes').bindparams(yes=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('hazard_rolls', 'applied')
    op.drop_column('games', 'geographic_scope')
