import cv2
import mediapipe as mp

mp_hands = mp.solutions.hands


def extract_hand_info(video_path):
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(video_path)

    total_frames = 0
    hand_frames = 0

    landmarks_data = []

    while cap.isOpened():
        success, frame = cap.read()

        if not success:
            break

        total_frames += 1

        rgb = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )

        results = hands.process(rgb)

        if results.multi_hand_landmarks:

            hand_frames += 1

            frame_landmarks = []

            for hand in results.multi_hand_landmarks:

                hand_points = []

                for lm in hand.landmark:

                    hand_points.append({
                        "x": lm.x,
                        "y": lm.y,
                        "z": lm.z
                    })

                frame_landmarks.append(hand_points)

            landmarks_data.append(frame_landmarks)

    cap.release()
    hands.close()

    return {
    "total_frames": total_frames,
    "hand_frames": hand_frames,
    "landmarks_count": len(landmarks_data)
}