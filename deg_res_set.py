class DeggResSet:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": ("INT", {"default": 1, "min": 1, "max": 3, "step": 1}),
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
        "3 ручных пресета разрешений. "
        "Через select (1-3) выберите, какая пара width/height идёт на выход."
    )

    def process(self, select, w1, h1, w2, h2, w3, h3):
        widths = [0, w1, w2, w3]
        heights = [0, h1, h2, h3]
        idx = int(select)
        return (widths[idx], heights[idx])


NODE_CLASS_MAPPINGS = {
    "DeggResSet": DeggResSet,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DeggResSet": "Degg Res Set",
}
