import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export interface EditableTableState {
  rows: string[][];
  /** First row is a header. */
  header: boolean;
  /** First column is a header. */
  headerColumn: boolean;
}

export interface EditableTableProps {
  /** Initial cell contents (row-major). Ragged rows are padded to the widest row. */
  rows: string[][];
  header?: boolean;
  headerColumn?: boolean;
  editable?: boolean;
  /** Whether this table is the focused segment — controls only show when it is. */
  active?: boolean;
  /** Fires on any structural or cell edit with the full current table state. */
  onChange?: (state: EditableTableState) => void;
  /** Fires when any cell gains focus (so a container can mark this segment active). */
  onFocus?: () => void;
  /** Fires when the user removes the whole table (so a container can drop the segment). */
  onDelete?: () => void;
  style?: StyleProp<ViewStyle>;
}

const MIN_ROWS = 1;
const MIN_COLS = 1;
const MIN_CELL_WIDTH = 110;

/** Normalize a possibly-ragged grid to a rectangle (every row the width of the widest). */
function rectangular(rows: string[][]): string[][] {
  const cols = Math.max(MIN_COLS, ...rows.map((r) => r.length));
  const height = Math.max(MIN_ROWS, rows.length);
  return Array.from({ length: height }, (_r, r) =>
    Array.from({ length: cols }, (_c, c) => rows[r]?.[c] ?? ''),
  );
}

type MenuKind = 'col' | 'row' | null;

/**
 * A fully editable table: type in any cell, insert/delete rows and columns in any direction,
 * toggle header row/column, and scroll horizontally when the table is wider than the screen.
 * Rendered as its own block between text segments (it can't live in the native text view).
 */
export function EditableTable({
  rows,
  header = true,
  headerColumn = false,
  editable = true,
  active = false,
  onChange,
  onFocus,
  onDelete,
  style,
}: EditableTableProps) {
  const [grid, setGrid] = useState<string[][]>(() => rectangular(rows));
  const [hasHeaderRow, setHasHeaderRow] = useState(header);
  const [hasHeaderCol, setHasHeaderCol] = useState(headerColumn);
  const [containerWidth, setContainerWidth] = useState(0);
  const [menu, setMenu] = useState<MenuKind>(null);
  // The most recently focused cell — insert/delete act relative to it.
  const focused = useRef<{ r: number; c: number }>({ r: 0, c: 0 });

  // Hide any open menu when the table loses focus.
  useEffect(() => {
    if (!active) setMenu(null);
  }, [active]);

  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 0;
  const cellWidth =
    containerWidth > 0 && colCount > 0
      ? Math.max(MIN_CELL_WIDTH, Math.floor((containerWidth - 4) / colCount))
      : MIN_CELL_WIDTH;

  const commit = (
    next: string[][],
    hRow = hasHeaderRow,
    hCol = hasHeaderCol,
  ) => {
    setGrid(next);
    setHasHeaderRow(hRow);
    setHasHeaderCol(hCol);
    onChange?.({ rows: next, header: hRow, headerColumn: hCol });
  };

  const setCell = (r: number, c: number, value: string) => {
    const next = grid.map((row) => row.slice());
    next[r][c] = value;
    commit(next);
  };

  const insertRowAt = (at: number) => {
    const next = grid.slice();
    next.splice(at, 0, Array.from({ length: colCount }, () => ''));
    commit(next);
  };

  const insertColumnAt = (at: number) => {
    const next = grid.map((row) => {
      const copy = row.slice();
      copy.splice(at, 0, '');
      return copy;
    });
    commit(next);
  };

  const deleteRow = () => {
    if (rowCount <= MIN_ROWS) return;
    const at = Math.min(focused.current.r, rowCount - 1);
    const next = grid.slice();
    next.splice(at, 1);
    focused.current = { r: Math.max(0, at - 1), c: focused.current.c };
    commit(next);
  };

  const deleteColumn = () => {
    if (colCount <= MIN_COLS) return;
    const at = Math.min(focused.current.c, colCount - 1);
    const next = grid.map((row) => {
      const copy = row.slice();
      copy.splice(at, 1);
      return copy;
    });
    focused.current = { r: focused.current.r, c: Math.max(0, at - 1) };
    commit(next);
  };

  const run = (fn: () => void) => {
    fn();
    setMenu(null);
  };

  return (
    <View
      style={[styles.wrap, style]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {editable && active && (
        <View style={styles.bar}>
          <Tab label="⬍ Column" open={menu === 'col'} onPress={() => setMenu(menu === 'col' ? null : 'col')} />
          <Tab label="⬌ Row" open={menu === 'row'} onPress={() => setMenu(menu === 'row' ? null : 'row')} />
          {onDelete && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="table-delete"
              style={[styles.tab, styles.danger]}
              onPress={onDelete}
            >
              <Text style={styles.dangerText}>🗑 Table</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {active && menu === 'col' && (
        <Menu>
          <Item
            label="Header column"
            toggle={hasHeaderCol}
            accessibilityLabel="table-header-column"
            onPress={() => run(() => commit(grid, hasHeaderRow, !hasHeaderCol))}
          />
          <Item label="Insert column left" accessibilityLabel="table-col-left" onPress={() => run(() => insertColumnAt(focused.current.c))} />
          <Item label="Insert column right" accessibilityLabel="table-col-right" onPress={() => run(() => insertColumnAt(focused.current.c + 1))} />
          <Item label="Delete column" danger accessibilityLabel="table-col-delete" onPress={() => run(deleteColumn)} />
        </Menu>
      )}

      {active && menu === 'row' && (
        <Menu>
          <Item
            label="Header row"
            toggle={hasHeaderRow}
            accessibilityLabel="table-header-row"
            onPress={() => run(() => commit(grid, !hasHeaderRow, hasHeaderCol))}
          />
          <Item label="Insert row above" accessibilityLabel="table-row-above" onPress={() => run(() => insertRowAt(focused.current.r))} />
          <Item label="Insert row below" accessibilityLabel="table-row-below" onPress={() => run(() => insertRowAt(focused.current.r + 1))} />
          <Item label="Delete row" danger accessibilityLabel="table-row-delete" onPress={() => run(deleteRow)} />
        </Menu>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.gridPad}>
        <View>
          {grid.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((cell, c) => {
                const isHeader = (hasHeaderRow && r === 0) || (hasHeaderCol && c === 0);
                return (
                  <TextInput
                    key={c}
                    accessibilityLabel={`cell-${r}-${c}`}
                    editable={editable}
                    multiline
                    value={cell}
                    onFocus={() => {
                      focused.current = { r, c };
                      onFocus?.();
                    }}
                    onChangeText={(t) => setCell(r, c, t)}
                    style={[styles.cell, { width: cellWidth }, isHeader && styles.headerCell]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Tab({ label, open, onPress }: { label: string; open: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.tab, open && styles.tabOpen]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, open && styles.tabTextOpen]}>{label} ▾</Text>
    </TouchableOpacity>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return <View style={styles.menu}>{children}</View>;
}

function Item({
  label,
  onPress,
  toggle,
  danger,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  toggle?: boolean;
  danger?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.item}
      onPress={onPress}
    >
      <Text style={[styles.itemText, danger && styles.dangerText]}>{label}</Text>
      {toggle !== undefined && (
        <Text style={[styles.itemToggle, toggle && styles.itemToggleOn]}>{toggle ? 'On' : 'Off'}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  bar: { flexDirection: 'row', gap: 6, paddingBottom: 6 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  tabOpen: { backgroundColor: '#DCEEFF', borderColor: '#1A73E8' },
  tabText: { fontSize: 13, color: '#333' },
  tabTextOpen: { color: '#1A73E8', fontWeight: '600' },
  danger: { borderColor: '#D93025' },
  dangerText: { color: '#D93025', fontSize: 13 },
  menu: {
    alignSelf: 'flex-start',
    minWidth: 200,
    marginBottom: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    paddingVertical: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  itemText: { fontSize: 15, color: '#222' },
  itemToggle: { fontSize: 12, color: '#888', fontWeight: '600' },
  itemToggleOn: { color: '#1A73E8' },
  gridPad: { padding: 1 },
  row: { flexDirection: 'row' },
  cell: {
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bbb',
    fontSize: 15,
    color: '#111',
    textAlignVertical: 'top',
  },
  headerCell: { backgroundColor: '#F1F3F4', fontWeight: '700' },
});
