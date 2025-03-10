import { reactive } from "@starbeam/js";
import { useSetup } from "@starbeam/react";
import type { FormEvent } from "react";

interface Person {
  name: string;
  location: string;
}

class Table<T> {
  #rows: Record<string, T> = reactive.object({}, "rows");
  #id = 0;

  constructor(readonly columns: string[]) {}

  get rows(): [string, T][] {
    return Object.entries(this.#rows);
  }

  append(row: T): void {
    this.#rows[`${this.#id++}`] = row;
  }
}

export default function Database(): JSX.Element {
  return useSetup(() => {
    const people = new Table<Person>(["name", "location"]);

    function append(event: FormEvent<HTMLFormElement>): void {
      event.preventDefault();
      people.append({ name: "Lorem Ipsum", location: "NYC" });
    }

    return () => (
      <>
        <form onSubmit={append}>
          <label>
            <button type="submit">append</button>
          </label>
        </form>

        <table>
          <thead>
            {people.rows.length === 0 ? null : (
              <tr>
                {people.columns.map((p) => (
                  <th key={p}>{p}</th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {people.rows.map(([id, person]) => (
              <tr key={id}>
                <td>{person.name}</td>
                <td>{person.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }).compute();
}
