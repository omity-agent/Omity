import { expect, test } from "bun:test";
import { UserMessageHistory } from "../../../src/app/frontend/components/Chat/Composer/history";

test("user message history moves backward and forward through messages", () => {
  const history = new UserMessageHistory();
  const messages = ["first", "second", "third"];
  expect(history.navigate("previous", "", messages)).toBe("third");
  expect(history.navigate("previous", "third", messages)).toBe("second");
  expect(history.navigate("previous", "second", messages)).toBe("first");
  expect(history.navigate("previous", "first", messages)).toBe("first");
  expect(history.navigate("next", "first", messages)).toBe("second");
  expect(history.navigate("next", "second", messages)).toBe("third");
  expect(history.navigate("next", "third", messages)).toBe("");
  expect(history.navigate("next", "", messages)).toBe("");
});
test("edited content leaves history browsing until the input is empty again", () => {
  const history = new UserMessageHistory();
  const messages = ["first", "second"];
  expect(history.navigate("previous", "draft", messages)).toBeUndefined();
  expect(history.navigate("previous", "", messages)).toBe("second");
  history.reset();
  expect(history.navigate("next", "edited", messages)).toBeUndefined();
  expect(history.navigate("previous", "edited", messages)).toBeUndefined();
  expect(history.navigate("previous", "", messages)).toBe("second");
  expect(history.navigate("next", "second", messages)).toBe("");
});
