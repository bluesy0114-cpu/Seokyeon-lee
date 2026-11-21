# 이석연 (Seokyeon Lee) — 공개 포트폴리오

AI 마케팅 워크플로우 아키텍트 · 주식회사 케어랩스 DM사업부 기획팀 팀장 이석연의 1페이지 공개 포트폴리오입니다.
빌드 도구 없이 동작하는 단일 정적 사이트입니다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 메인 (CSS·JS 인라인, 외부 의존은 Pretendard 웹폰트 1개) |
| `projects.html` | 캠페인 아카이브 43건 — 필터·검색·상세 모달 |
| `films.html` | 영상 필름 18편 — 필터·Full Credits·인라인 플레이어 |
| `assets/archive.css` | 두 아카이브 페이지 공통 스타일 |
| `assets/projects/` | 캠페인 썸네일 43개 (JPEG 32 + 타이포그래피 SVG 11) |
| `assets/films/` | 영상 썸네일 18개 (로컬 JPEG) |
| `data/projects.json` · `data/films.json` | 아카이브 원본 데이터 (페이지에는 인라인으로 포함) |
| `sitemap.xml` | 검색엔진 사이트맵 (3페이지) |
| `robots.txt` | 크롤링 허용 + 사이트맵 위치 |
| `og-image.png` | OpenGraph/Twitter 공유 카드 (1200×630) |

## 섹션 (index.html)

1. Hero — 이름·직함·한 줄 소개
2. Selected Works — 핵심 성과 4개 + 대표 캠페인·필름 8개 (아카이브 딥링크)
3. Core Focus — 프로세스 표준화 / SLA·병목 가시화 / 리젝트 학습형 AI 워크플로우
4. Architecture — 업무 시스템 개념 아키텍처 3개 (대외비 제외)
5. Free Tool — 광고 카피 · 심의 주의어 체크기 (순수 프론트엔드)
6. Career — 케어랩스(현) / 넷마블MNB / 엠포스 / CJ 올리브네트웍스 (근무 기간 표기 없음)
7. Contact — 이메일

## 배포 (GitHub Pages)

저장소: `bluesy0114-cpu/Seokyeon-lee` → 공개 URL `https://bluesy0114-cpu.github.io/Seokyeon-lee/`

> 저장소 이름과 배포 경로는 **대소문자를 구분**합니다. 주소를 소문자(`seokyeon-lee`)로 적으면 404가 나고 `robots.txt`의 사이트맵도 무효가 됩니다.

```bash
cd work/_deploy/repo
git init -b main && git add -A && git commit -m "이석연 공개 포트폴리오 v1"
gh repo create bluesy0114-cpu/Seokyeon-lee --public --source=. --remote=origin --push
gh api -X POST repos/bluesy0114-cpu/Seokyeon-lee/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

`gh api` 호출에 Repository administration 권한이 없으면 저장소 생성·Pages 활성화가 403으로 막힙니다.
그 경우 GitHub 웹에서 저장소를 만들고 Settings → Pages → Branch: `main` / `root`로 직접 켜면 됩니다.

## 수정 시 지켜야 할 것

- **대외비 금지**: 광고주 실명, 내부 매출·수치, 사내 미공표 조직·사명 표기, 직원 이름, 내부 시스템 URL·계정.
- **경력 표기**: 근무 기간은 쓰지 않고 회사명·부서/직책만 적습니다.
- 아카이브 데이터를 고칠 때는 `data/*.json`을 원본으로 삼고, 페이지 안의 인라인 JSON도 함께 맞춰 주세요.
- `<link rel="canonical">`, `og:url`, `og:image`, `sitemap.xml`의 주소는 배포 도메인과 함께 바꿔 주세요.
- 글자 크기가 10px 안팎인 라틴 라벨은 `letter-spacing`을 0.04em 이하로 두면 글자 사이가 벌어져 보이지 않습니다.
