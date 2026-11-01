// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render, cleanup } from "@testing-library/react";
import { AppearanceProvider, StoreLogo } from "@/components/appearance/context";
import { makeDefault } from "@/modules/appearance/schema";
afterEach(cleanup);
it("uses the two-color demo mark only on compatible white surfaces", () => {
 const config=makeDefault();
 const view=()=>createElement(AppearanceProvider,{config,children:createElement(StoreLogo)});
 const result=render(view());
 expect(result.container.querySelector(".jetseller-wordmark")).not.toBeNull();
 config.colors.header="#E1251B";config.colors.headerText="#FFFFFF";result.rerender(view());
 expect(result.container.querySelector(".jetseller-wordmark")).toBeNull();expect(result.container.textContent).toBe("JetSeller");
 config.identity.name="Independent Store";result.rerender(view());expect(result.container.textContent).toBe("Independent Store");
});
