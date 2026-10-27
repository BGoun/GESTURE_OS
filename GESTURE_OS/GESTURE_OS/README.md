# GESTURE OS

손동작으로 웹 UI를 제어하는 브라우저 기반 프로토타입입니다. MediaPipe Hand Landmarker로 손 관절을 추적하고, 웹캠 미리보기는 화면 오른쪽 아래에 표시합니다.

## 기능
- 카메라 시작/종료 및 오른쪽 아래 웹캠 미리보기
- 손 관절 추적 오버레이
- 기본 손동작 판별: 손바닥, 주먹, 검지, 브이, 엄지, 세 손가락 등
- 제스처 기반 메뉴 토글, 앱 선택, 앱 실행, 뒤로 가기
- 앱 런처, 설정 창, 활동 기록
- 민감도 및 미리보기 설정
- 반응형 다크 네온 UI

## 실행 방법
카메라 접근 권한 때문에 `file://`로 직접 열기보다 로컬 서버 또는 HTTPS를 사용하세요.

### VS Code
1. 폴더를 VS Code로 엽니다.
2. Live Server 확장 프로그램을 설치합니다.
3. `index.html`에서 **Open with Live Server**를 선택합니다.
4. 브라우저에서 카메라 권한을 허용하고 **카메라 시작**을 누릅니다.

### Python 로컬 서버
프로젝트 폴더에서 터미널을 열고 실행합니다.

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

## GitHub Pages 배포
1. 이 폴더 안의 파일을 GitHub 저장소 루트에 업로드합니다.
2. 저장소 Settings → Pages로 이동합니다.
3. Deploy from a branch → `main` → `/ (root)`를 선택하고 저장합니다.
4. 생성된 HTTPS 사이트에 접속해 카메라 권한을 허용합니다.

## Teachable Machine 모델 연결
1. Teachable Machine에서 Image Project를 생성하고 아래 이름으로 클래스를 만듭니다.
   `OPEN_PALM`, `FIST`, `POINT`, `THUMBS_UP`, `PEACE`, `OK_SIGN`, `ROCK`, `LEFT`, `RIGHT`, `THREE`, `NONE`
2. 각 클래스에서 웹캠 이미지 예시를 촬영하고 모델을 학습합니다.
3. Export Model → TensorFlow.js → Download my model을 선택합니다.
4. ZIP을 풀고 `model.json`, `metadata.json`, `weights.bin` 파일을 `models/` 폴더에 복사합니다.
5. 웹사이트를 새로고침하고 **AI 모델 불러오기**를 누릅니다.
6. 모델이 연결되면 제스처 분류는 Teachable Machine 예측을 사용하고, MediaPipe는 손 추적 오버레이와 포인터 좌표를 계속 담당합니다.

모델 파일이 없거나 로드에 실패하면 기본 MediaPipe 규칙 기반 제스처 인식은 계속 사용할 수 있습니다. 클래스 이름은 위 영문 이름과 동일하게 지정하는 것을 권장합니다.

## 참고
- MediaPipe, TensorFlow.js 및 Teachable Machine 라이브러리는 CDN에서 가져오므로 최초 실행 시 인터넷 연결이 필요합니다.
- 영상은 브라우저에서 처리하며 서버로 업로드하지 않습니다.
- 기본 규칙 기반 제스처 판별은 프로토타입입니다. 손 크기, 각도, 카메라 좌우 반전, 조명에 따라 오인식이 있을 수 있습니다.
- Teachable Machine의 이미지 분류는 손의 움직임 좌표를 직접 제공하지 않습니다. 포인터 추적은 MediaPipe 손 관절 좌표를 이용합니다.
- 브라우저가 GPU delegate를 지원하지 않는 경우 MediaPipe 초기화가 실패할 수 있습니다. 이 경우 `js/app.js`의 `delegate: "GPU"`를 `"CPU"`로 바꿔 테스트하세요.
