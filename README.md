# 📱 한국 가족 호칭 사전 & 가계도 편집기 ('호칭이?')

이 프로젝트는 한국 가족 간의 헷갈리기 쉬운 호칭을 나로부터의 관계 경로를 통해 알려주고, 가계도를 편집(CRUD)할 수 있으며, 관련 상식을 퀴즈로 학습할 수 있는 반응형 웹 애플리케이션입니다.

---

## 🌐 GitHub Pages 서비스 접속 링크

GitHub Pages 설정이 완료되면 아래 URL을 통해 웹 브라우저에서 직접 접속할 수 있습니다.

* **📱 애플리케이션 바로가기**: [https://salgoo100.github.io/projects/korean_family_titles.html](https://salgoo100.github.io/projects/korean_family_titles.html)
* **📊 테스트 검증 리포트**: [https://salgoo100.github.io/projects/report.html](https://salgoo100.github.io/projects/report.html)

---

## ⚙️ GitHub Pages 활성화 가이드

만약 링크 접속 시 `404 Not Found` 오류가 나타난다면, 아래 순서대로 GitHub 저장소 설정을 활성화해 주세요.

1. **GitHub 웹 저장소**([https://github.com/salgoo100/projects](https://github.com/salgoo100/projects))에 접속합니다.
2. 저장소 우측 상단의 **⚙️ Settings** 탭을 클릭합니다.
3. 좌측 메뉴바의 **Code and automation** 카테고리 하위의 **📖 Pages** 메뉴를 선택합니다.
4. **Build and deployment** 섹션에서 다음과 같이 설정합니다:
   * **Source**: `Deploy from a branch` (기본값)
   * **Branch**: `main` 브랜치 선택 / `/ (root)` 폴더 선택
5. 오른쪽에 활성화되는 **💾 Save** 버튼을 클릭합니다.
6. 약 1~2분 뒤 페이지 상단에 **"Your site is live at..."** 문구와 함께 호스팅 주소가 표시되면 배포가 완료된 것입니다.

---

## 🧪 로컬 테스트 실행 방법

가상 브라우저 환경(JSDOM)을 통해 핵심 로직(무결성, 성별/결혼 토글, 계산기 라우팅, CRUD, 퀴즈 채점)을 검증하려면 아래 명령어를 입력하십시오.

```bash
# 종속성 설치 (최초 1회)
npm install

# 테스트 스위트 구동
node test_suite.js
```
* 테스트를 실행하면 검증 완료 후 `report.html` 파일이 자동 갱신됩니다.
