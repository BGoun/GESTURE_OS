GESTURE OS - Teachable Machine 모델 폴더

1. Teachable Machine Image Project를 만들고 아래 클래스명을 정확히 사용하세요:
   OPEN_PALM, FIST, POINT, THUMBS_UP, PEACE, OK_SIGN, ROCK, LEFT, RIGHT, THREE, NONE
2. 각 클래스에서 웹캠 이미지 샘플을 촬영한 후 학습합니다.
3. Export Model > TensorFlow.js > Download my model을 선택하고 ZIP 압축을 풉니다.
4. model.json, metadata.json, weights.bin을 이 폴더에 복사하세요.
5. 사이트에서 'AI 모델 불러오기'를 누르면 모델을 불러옵니다.

주의: Teachable Machine의 이미지 분류는 손의 위치 추적을 하지 않습니다. MediaPipe는 포인터/관절 추적에 계속 사용됩니다.
