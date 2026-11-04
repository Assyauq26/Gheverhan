// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render, cleanup } from "@testing-library/react";
import { AppearanceProvider, StoreLogo } from "@/components/appearance/context";
import { makeDefault } from "@/modules/appearance/schema";
import { contrastErrors } from "@/modules/appearance/contrast";
afterEach(cleanup);
it("renders merchant identity without substituting the platform wordmark", () => {
 const config=makeDefault();
 const view=()=>createElement(AppearanceProvider,{config,children:createElement(StoreLogo)});
 const result=render(view());
 expect(result.container.textContent).toBe("Toko Anda");
 config.colors.header="#E1251B";config.colors.headerText="#FFFFFF";result.rerender(view());
 expect(result.container.querySelector(".jetseller-wordmark")).toBeNull();expect(result.container.textContent).toBe("Toko Anda");
 config.identity.name="Independent Store";result.rerender(view());expect(result.container.textContent).toBe("Independent Store");
});
for (const target of ["header", "footer"] as const) {
 it(`inherits contextual foreground for a ${target} gradient over white base tokens`, () => {
  const config = makeDefault();
  config.gradients[target].enabled = true;
  expect(contrastErrors(config)).toEqual([]);
  const result = render(createElement(AppearanceProvider, {
   config,
   children: createElement("div", { style: { color: config.gradients[target].foreground } }, createElement(StoreLogo)),
  }));
  expect(result.container.querySelector(".jetseller-wordmark")).toBeNull();
  expect(result.container.textContent).toBe("Toko Anda");
  expect(result.getByText("Toko Anda").style.color).toBe("");
 });
}
