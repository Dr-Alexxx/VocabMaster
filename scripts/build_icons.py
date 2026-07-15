"""Turn the generated icon artwork into transparent PNG and Windows ICO assets."""

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "imagegen" / "vocabmaster-icon-source.png"
RESOURCE_DIR = ROOT / "resources" / "icons"
PUBLIC_DIR = ROOT / "public"


def is_background(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, _alpha = pixel
    return min(red, green, blue) >= 242 and max(red, green, blue) - min(red, green, blue) <= 8


def remove_connected_background(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    pixels = result.load()
    width, height = result.size
    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()
    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))
    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= width or y >= height or (x, y) in seen:
            continue
        seen.add((x, y))
        if not is_background(pixels[x, y]):
            continue
        red, green, blue, _alpha = pixels[x, y]
        distance = max(0, 255 - min(red, green, blue))
        pixels[x, y] = (red, green, blue, min(255, distance * 18))
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    return result


def main() -> None:
    RESOURCE_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    icon = remove_connected_background(Image.open(SOURCE))
    icon.save(RESOURCE_DIR / "icon.png")
    icon.save(PUBLIC_DIR / "app-icon.png")
    icon.save(
        RESOURCE_DIR / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("Wrote icon.png, app-icon.png, and multi-size icon.ico")


if __name__ == "__main__":
    main()
