def predict(result):

    hand_frames = result["hand_frames"]

    if hand_frames >= 30:
        return "你好"

    elif hand_frames >= 10:
        return "謝謝"

    return "未知手勢"