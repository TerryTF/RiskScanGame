"""Write the FastAPI OpenAPI schema to backend/openapi.json (run from the backend directory)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

OUTPUT = Path(__file__).resolve().parents[1] / "openapi.json"


def main() -> None:
    app = create_app(Settings(database_url="sqlite://", auto_migrate=False))
    OUTPUT.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
