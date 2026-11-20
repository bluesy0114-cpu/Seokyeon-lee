# 이석연 (Seokyeon Lee) — 공개 포트폴리오

AI 마케팅 워크플로우 아키텍트 · 주식회사 케어랩스 DM사업부 기획팀 팀장 이석연의 1페이지 공개 포트폴리오입니다.
빌드 도구 없이 동작하는 단일 정적 사이트입니다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 전체 페이지 (CSS·JS 인라인, 외부 의존은 Pretendard 웹폰트 1개) |
| `sitemap.xml` | 검색엔진 사이트맵 |
| `robots.txt` | 크롤링 허용 + 사이트맵 위치 |
| `og-image.png` | OpenGraph/Twitter 공유 카드 (1200×630) |

## 섹션

1. Hero — 이름·직함·한 줄 소개
2. Core Focus — 프로세스 표준화 / SLA·병목 가시화 / 리젝트 학습형 AI 워크플로우
3. Architecture — 업무 시스템 개념 아키텍처 3개 (대외비 제외)
4. Free Tool — 광고 카피 · 심의 주의어 체크기 (순수 프론트엔드)
5. Career — 케어랩스(현) / 넷마블MNB / CJ 올리브네트웍스
6. Contact — 이메일

## 배포 (GitHub Pages)

저장소: `bluesy0114-cpu/seokyeon-lee` → 공개 URL `https://bluesy0114-cpu.github.io/seokyeon-lee/`

```bash
cd work/seokyeon-portfolio
git init -b main && git add -A && git commit -m "이석연 공개 포트폴리오 v1"
gh repo create bluesy0114-cpu/seokyeon-lee --public --source=. --remote=origin --push
gh api -X POST repos/bluesy0114-cpu/seokyeon-lee/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

`gh api` 호출에 Repository administration 권한이 없으면 저장소 생성·Pages 활성화가 403으로 막힙니다.
그 경우 GitHub 웹에서 저장소를 만들고 Settings → Pages → Branch: `main` / `root`로 직접 켜면 됩니다.

## 수정 시 지켜야 할 것

- **대외비 금지**: 광고주 실명, 내부 매출·수치, 공시 전 사명 변경 관련 내용, 직원 이름, 내부 시스템 URL·계정.
- `<link rel="canonical">`, `og:url`, `og:image`, `sitemap.xml`의 주소는 배포 도메인과 함께 바꿔 주세요.
- 글자 크기가 10px 안팎인 라틴 라벨은 `letter-spacing`을 0.04em 이하로 두면 글자 사이가 벌어져 보이지 않습니다.
