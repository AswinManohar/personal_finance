"""Project entrypoint stub.

The deployed application is `api.main:app` (see Dockerfile). The read-only
Life OS integration endpoints live in `api/routers/integrations.py` and are
served under `/v1/integrations/*` by that same app. Run the full app locally with:

    uvicorn api.main:app --reload --port 8000
"""


def main():
    print("Run the app with: uvicorn api.main:app --reload --port 8000")


if __name__ == "__main__":
    main()
