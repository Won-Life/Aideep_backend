# 홈서버 Self-hosted Runner 설치 가이드

이 문서는 `develop` / `main` push 시 홈서버에서 직접 Docker 이미지를 빌드하고 배포하기 위한 GitHub Actions self-hosted runner 설치/운영 가이드다.

## 0. 사전 요구사항

- 홈서버 OS: Linux (ARM64)
- Docker Engine + Docker Compose v2
- 외부 인터넷 outbound 가능 (인바운드 포트 개방 불필요)
- Docker Hub 계정 + Access Token (PAT)

## 1. 필수 패키지 설치

```bash
sudo apt-get update
sudo apt-get install -y curl jq git
```

## 2. Runner 사용자 준비

runner는 docker daemon에 접근해야 한다. runner 데몬을 실행할 사용자(예: `gh-runner`)를 만들고 docker 그룹에 추가한다.

```bash
sudo useradd -m -s /bin/bash gh-runner
sudo usermod -aG docker gh-runner
sudo -iu gh-runner
```

> docker 그룹 멤버십은 사실상 root 권한이다. 본 repo가 private인지 다시 확인하고 진행할 것.

## 3. Runner 다운로드 & 등록

GitHub repo → Settings → Actions → Runners → "New self-hosted runner" → Linux / ARM64 선택. 거기서 발급되는 토큰을 사용한다.

```bash
mkdir actions-runner && cd actions-runner

# 최신 ARM64 runner 다운로드 (버전은 GitHub UI에서 안내된 것 사용)
curl -o actions-runner-linux-arm64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.319.1/actions-runner-linux-arm64-2.319.1.tar.gz
tar xzf actions-runner-linux-arm64.tar.gz

# 라벨 self-hosted, linux, ARM64 는 기본 부여됨
./config.sh --url https://github.com/<OWNER>/<REPO> --token <REGISTRATION_TOKEN>
```

## 4. 서비스 등록

```bash
sudo ./svc.sh install gh-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

서버 재부팅 후에도 자동 기동된다.

## 5. 배포 작업 디렉터리 준비

워크플로우는 `docker compose up -d`를 실행하므로 `docker-compose.yml`이 있는 위치에서 동작한다. runner는 GitHub repo를 자체적으로 checkout하므로 별도 작업은 없지만, **컨테이너가 참조할 `.env` 파일**은 runner의 워크스페이스에 미리 배치되어 있어야 한다.

```bash
# runner 작업 디렉터리: ~/actions-runner/_work/<REPO>/<REPO>/
cp /etc/secrets/aideep.env ~/actions-runner/_work/Aideep_backend/Aideep_backend/.env
```

또는 더 안전하게: `.env`를 고정된 외부 경로에 두고 compose의 `env_file:` 경로를 절대경로로 바꾸거나, GitHub Secrets로 옮겨 runner가 잡 시작 시 생성하도록 한다(후속 검토).

## 6. GitHub Secrets 등록

repo Settings → Secrets and variables → Actions → New repository secret:

| 이름                 | 값                           |
| -------------------- | ---------------------------- |
| `DOCKERHUB_USERNAME` | Docker Hub 사용자명          |
| `DOCKERHUB_TOKEN`    | Docker Hub Access Token(PAT) |

## 7. 빌드 캐시 디렉터리

워크플로우는 `/tmp/buildx-cache`를 사용한다. runner 사용자가 쓸 수 있도록 권한 확인:

```bash
mkdir -p /tmp/buildx-cache
chown gh-runner:gh-runner /tmp/buildx-cache
```

`/tmp`은 재부팅 시 비워질 수 있으므로 빠르게 안정화하려면 `/var/lib/buildx-cache`로 옮기는 것도 고려.

## 8. 동작 확인

1. `develop` 브랜치에 의미 있는 커밋 메시지로 push.
2. GitHub Actions 탭에서 잡이 `self-hosted` runner로 라우팅되는지 확인.
3. 홈서버에서:
   ```bash
   docker images | grep myform_reform
   docker ps
   curl -s http://localhost:3320/v1/aideep/api/docs | head -c 50
   ```
4. 컨테이너 로그에서 `prisma migrate deploy` 출력 확인:
   ```bash
   docker logs aideep-app --tail 50
   ```

## 9. 보존 정책 동작 확인

- 서로 다른 커밋 메시지로 4회 push.
- 로컬: `docker images | grep "myform_reform:develop-"` → 3개만 남아야 함.
- Hub: 웹 UI 또는 `docker search`로 태그 목록 확인 → `develop-*` 태그가 3개.

## 10. 롤백 절차

```bash
cd ~/actions-runner/_work/Aideep_backend/Aideep_backend
IMAGE_TAG=develop-<이전-커밋-슬러그> docker compose up -d
```

## 11. 운영 팁

- runner 자원 격리: `docker build --memory=2g --cpus=2` 옵션 고려.
- runner 로그: `journalctl -u actions.runner.* -f`.
- runner 업그레이드: GitHub UI에서 새 버전 안내가 뜨면 `./run.sh`로 자동 갱신되거나 수동으로 재설치.
