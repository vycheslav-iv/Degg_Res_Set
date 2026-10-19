import math


class DeggResSet:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": ("INT", {"default": 1, "min": 1, "max": 4, "step": 1}),
                "aspect_ratio": (
                    [
                        "1:1 (Square)",
                        "2:3 (Portrait Photo)",
                        "3:2 (Photo)",
                        "3:4 (Portrait Standard)",
                        "4:3 (Standard)",
                        "9:16 (Portrait Widescreen)",
                        "16:9 (Widescreen)",
                        "21:9 (Ultrawide)",
                    ],
                    {"default": "1:1 (Square)"},
                ),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1}),
                "multiple": ("INT", {"default": 8, "min": 8, "max": 128, "step": 4}),
                "w1": ("INT", {"default": 512, "min": 1, "max": 16384, "step": 1}),
                "h1": ("INT", {"default": 512, "min": 1, "max": 16384, "step": 1}),
                "w2": ("INT", {"default": 768, "min": 1, "max": 16384, "step": 1}),
                "h2": ("INT", {"default": 768, "min": 1, "max": 16384, "step": 1}),
                "w3": ("INT", {"default": 1024, "min": 1, "max": 16384, "step": 1}),
                "h3": ("INT", {"default": 1024, "min": 1, "max": 16384, "step": 1}),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "process"
    CATEGORY = "My_custom_nodes/Res"
    DESCRIPTION = (
        "4 пресета разрешений. "
        "Preset 1: расчёт из aspect ratio + мегапиксели + кратность (как ResolutionSelector). "
        "Presets 2-4: ручной ввод ширины/высоты."
    )

    @staticmethod
    def _parse_aspect(aspect_str):
        """Из '16:9 (Widescreen)' → (16, 9)"""
        parts = aspect_str.split(" ")[0]
        w, h = parts.split(":")
        return int(w), int(h)

    def process(self, select, aspect_ratio, megapixels, multiple, w1, h1, w2, h2, w3, h3):
        if select == 1:
            ratio_w, ratio_h = self._parse_aspect(aspect_ratio)
            total_pixels = megapixels * 1_048_576
            # Same formula as comfy_extras/nodes_resolution.py (ResolutionSelector):
            # round() ties to even, matching the frontend ResolutionPreview widget.
            scale = math.sqrt(total_pixels / (ratio_w * ratio_h))
            w = round(scale * ratio_w / multiple) * multiple
            h = round(scale * ratio_h / multiple) * multiple
            return (w, h)
        elif select == 2:
            return (w1, h1)
        elif select == 3:
            return (w2, h2)
        else:
            return (w3, h3)


NODE_CLASS_MAPPINGS = {
    "DeggResSet": DeggResSet,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DeggResSet": "Degg Res Set",
}
