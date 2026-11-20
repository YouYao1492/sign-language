import cv2
import mediapipe as mp

print("Program Started")

# ======================
# MediaPipe
# ======================
mp_hands = mp.solutions.hands
mp_pose = mp.solutions.pose

mp_draw = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles

# ======================
# Camera
# ======================
cap = cv2.VideoCapture(0)

print("Camera Opened:", cap.isOpened())

if not cap.isOpened():
    print("Camera Open Failed")
    exit()

# ======================
# Hands
# ======================
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    model_complexity=0,
    min_detection_confidence=0.2,
    min_tracking_confidence=0.2,
)

# ======================
# Pose
# ======================
pose = mp_pose.Pose(
    min_detection_confidence=0.3,
    min_tracking_confidence=0.3,
)

# ======================
# Main Loop
# ======================
while True:

    success, frame = cap.read()

    if not success:
        break

    frame = cv2.flip(frame, 1)

    rgb = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2RGB
    )

    rgb.flags.writeable = False

    hand_results = hands.process(rgb)
    pose_results = pose.process(rgb)

    rgb.flags.writeable = True

    h, w, _ = frame.shape

    # =====================================
    # Pose：雙手手臂
    # =====================================
    if pose_results.pose_landmarks:

        landmarks = pose_results.pose_landmarks.landmark

        # 右手
        right_shoulder = (
            int(landmarks[12].x * w),
            int(landmarks[12].y * h)
        )

        right_elbow = (
            int(landmarks[14].x * w),
            int(landmarks[14].y * h)
        )

        right_wrist = (
            int(landmarks[16].x * w),
            int(landmarks[16].y * h)
        )

        # 左手
        left_shoulder = (
            int(landmarks[11].x * w),
            int(landmarks[11].y * h)
        )

        left_elbow = (
            int(landmarks[13].x * w),
            int(landmarks[13].y * h)
        )

        left_wrist = (
            int(landmarks[15].x * w),
            int(landmarks[15].y * h)
        )

        # 白色手臂線條
        cv2.line(
            frame,
            right_shoulder,
            right_elbow,
            (255, 255, 255),
            5
        )

        cv2.line(
            frame,
            right_elbow,
            right_wrist,
            (255, 255, 255),
            5
        )

        cv2.line(
            frame,
            left_shoulder,
            left_elbow,
            (255, 255, 255),
            5
        )

        cv2.line(
            frame,
            left_elbow,
            left_wrist,
            (255, 255, 255),
            5
        )

        # 紅色關節點
        joints = [
            right_shoulder,
            right_elbow,
            right_wrist,
            left_shoulder,
            left_elbow,
            left_wrist
        ]

        for joint in joints:
            cv2.circle(
                frame,
                joint,
                10,
                (0, 0, 255),
                -1
            )

    # =====================================
    # Hands
    # =====================================
    if hand_results.multi_hand_landmarks:

        for hand_landmarks in hand_results.multi_hand_landmarks:

            mp_draw.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                mp_styles.get_default_hand_landmarks_style(),
                mp_styles.get_default_hand_connections_style(),
            )

        cv2.putText(
            frame,
            "HAND DETECTED",
            (20, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 255, 0),
            2
        )

    # =====================================
    # Display
    # =====================================
    cv2.imshow(
        "Sign Language Test",
        frame
    )

    if cv2.waitKey(1) & 0xFF == 27:
        break

# ======================
# Release
# ======================
hands.close()
pose.close()

cap.release()
cv2.destroyAllWindows()