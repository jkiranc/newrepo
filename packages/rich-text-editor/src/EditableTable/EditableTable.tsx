import React, { useRef, useState } from 'react';
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

export interface EditableTableProps {
  /** Initial cell contents (row-major). Ragged rows are padded to the widest row. */
  rows: string[][];
  /** Whether the first row is a header (bold, shaded). */
  header?: boolean;
  editable?: boolean;
  /** Fires on any structural or cell edit with the full current grid + header flag. */
  onChange?: (rows: string[][], header: boolean) => void;
  /** Fires when any cell gains focus (so a container can mark this segment active). */
  onFocus?: () => void;
  /** Fires when the user removes the whole table (so a container can drop the segment). */
  onDelete?: () => void;
  style?: StyleProp<ViewStyle>;
}

const MIN_ROWS = 1;
const MIN_COLS = 1;

/** Normalize a possibly-ragged grid to a rectangle (every row the width of the widest). */
function rectangular(rows: string[][]): string[][] {
  const cols = Math.max(MIN_COLS, ...rows.map((r) => r.length));
  const height = Math.max(MIN_ROWS, rows.length);
  return Array.from({ length: height }, (_r, r) =>
    Array.from({ length: cols }, (_c, c) => rows[r]?.[c] ?? ''),
  );
}

/**
 * A fully editable table: type in any cell, insert/delete rows and columns, and scroll
 * horizontally when the table is wider than the screen. Unlike the read-only drawn table,
 * this is a real grid of inputs, so it lives as its own block between text segments rather
 * than inside the single native text view.
 */
export function EditableTable({
  rows,
  header = true,
  editable = true,
  onChange,
  onFocus,
  onDelete,
  style,
}: EditableTableProps) {
  const [grid, setGrid] = useState<string[][]>(() => rectangular(rows));
  const [hasHeader, setHasHeader] = useState(header);
  // Available width, so cells stretch to fill a narrow table and scroll only when too wide.
  const [containerWidth, setContainerWidth] = useState(0);
  // The most recently focused cell — insert/delete act relative to it (else the last row/col).
  const focused = useRef<{ r: number; c: number }>({ r: 0, c: 0 });

  const commit = (next: string[][], nextHeader = hasHeader) => {
    setGrid(next);
    onChange?.(next, nextHeader);
  };

  const setCell = (r: number, c: number, value: string) => {
    const next = grid.map((row) => row.slice());
    next[r][c] = value;
    commit(next);
  };

  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 0;
  const MIN_CELL_WIDTH = 110;
  const cellWidth =
    containerWidth > 0 && colCount > 0
      ? Math.max(MIN_CELL_WIDTH, Math.floor((containerWidth - 4) / colCount))
      : MIN_CELL_WIDTH;

  const addRow = () => {
    const at = Math.min(focused.current.r + 1, rowCount);
    const next = grid.slice();
    next.splice(at, 0, Array.from({ length: colCount }, () => ''));
    commit(next);
  };

  const addColumn = () => {
    const at = Math.min(focused.current.c + 1, colCount);
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

  const toggleHeader = () => {
    const next = !hasHeader;
    setHasHeader(next);
    onChange?.(grid, next);
  };

  return (
    <View
      style={[styles.wrap, style]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.gridPad}>
        <View>
          {grid.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((cell, c) => {
                const isHeader = hasHeader && r === 0;
                return (
                  <TextInput
                    key={c}
                    accessibilityLabel={`cell-${r}-${c}`}
                    editable={editable}
                    multiline
                    value={cell}
                    placeholder=""
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

      {editable && (
        <View style={styles.toolbar}>
          <Ctl label="+ Row" onPress={addRow} accessibilityLabel="table-add-row" />
          <Ctl label="+ Col" onPress={addColumn} accessibilityLabel="table-add-col" />
          <Ctl label="− Row" onPress={deleteRow} accessibilityLabel="table-del-row" />
          <Ctl label="− Col" onPress={deleteColumn} accessibilityLabel="table-del-col" />
          <Ctl
            label={hasHeader ? '✓ Header' : 'Header'}
            active={hasHeader}
            onPress={toggleHeader}
            accessibilityLabel="table-toggle-header"
          />
          {onDelete && (
            <Ctl label="🗑 Table" onPress={onDelete} accessibilityLabel="table-delete" danger />
          )}
        </View>
      )}
    </View>
  );
}

function Ctl({
  label,
  onPress,
  active,
  danger,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.ctl, active && styles.ctlActive, danger && styles.ctlDanger]}
      onPress={onPress}
    >
      <Text style={[styles.ctlText, active && styles.ctlTextActive, danger && styles.ctlTextDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  gridPad: { padding: 1 },
  row: { flexDirection: 'row' },
  cell: {
    width: 120,
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
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 8 },
  ctl: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  ctlActive: { backgroundColor: '#DCEEFF', borderColor: '#1A73E8' },
  ctlDanger: { borderColor: '#D93025' },
  ctlText: { fontSize: 13, color: '#333' },
  ctlTextActive: { color: '#1A73E8', fontWeight: '600' },
  ctlTextDanger: { color: '#D93025' },
});
