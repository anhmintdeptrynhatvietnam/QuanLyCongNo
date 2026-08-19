// Test suite for filter utilities and filter mechanisms
import {
  getPresetDateRange,
  isDateInRange,
  isAmountInRange,
  sortDataList,
  countActiveFilters,
  DATE_PRESETS
} from './js/utils/filter-helpers.js';

let passed = 0;
let total = 0;

function assert(name, condition, extra = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } else {
    console.error(`❌ [FAIL] ${name}`, extra);
  }
}

console.log("🚀 Bắt đầu kiểm thử toàn diện Hệ Thống Bộ Lọc Đa Tiêu Chí (Filter System)...");

// 1. Kiểm thử isDateInRange
assert("isDateInRange: Không giới hạn ngày thì luôn true", isDateInRange("2026-08-15", "", "") === true);
assert("isDateInRange: Ngày trong khoảng", isDateInRange("2026-08-15", "2026-08-01", "2026-08-31") === true);
assert("isDateInRange: Ngày bằng mốc từ ngày", isDateInRange("2026-08-01", "2026-08-01", "2026-08-31") === true);
assert("isDateInRange: Ngày bằng mốc đến ngày", isDateInRange("2026-08-31", "2026-08-01", "2026-08-31") === true);
assert("isDateInRange: Ngày trước mốc từ ngày -> false", isDateInRange("2026-07-31", "2026-08-01", "2026-08-31") === false);
assert("isDateInRange: Ngày sau mốc đến ngày -> false", isDateInRange("2026-09-01", "2026-08-01", "2026-08-31") === false);
assert("isDateInRange: Chỉ giới hạn từ ngày", isDateInRange("2026-08-15", "2026-08-01", "") === true);
assert("isDateInRange: Chỉ giới hạn đến ngày", isDateInRange("2026-08-15", "", "2026-08-31") === true);
assert("isDateInRange: Ngày trống -> false khi có điều kiện", isDateInRange("", "2026-08-01", "2026-08-31") === false);

// 2. Kiểm thử isAmountInRange
assert("isAmountInRange: Không giới hạn tiền thì luôn true", isAmountInRange(50000000, "", "") === true);
assert("isAmountInRange: Số tiền nằm giữa min và max", isAmountInRange(50000000, 10000000, 100000000) === true);
assert("isAmountInRange: Số tiền bằng min", isAmountInRange(10000000, 10000000, 100000000) === true);
assert("isAmountInRange: Số tiền bằng max", isAmountInRange(100000000, 10000000, 100000000) === true);
assert("isAmountInRange: Số tiền nhỏ hơn min -> false", isAmountInRange(5000000, 10000000, 100000000) === false);
assert("isAmountInRange: Số tiền lớn hơn max -> false", isAmountInRange(150000000, 10000000, 100000000) === false);
assert("isAmountInRange: Chỉ có min", isAmountInRange(20000000, 10000000, "") === true);
assert("isAmountInRange: Chỉ có max", isAmountInRange(20000000, "", 30000000) === true);

// 3. Kiểm thử getPresetDateRange
const todayPreset = getPresetDateRange("today");
assert("Preset today có fromDate = toDate", todayPreset.fromDate !== "" && todayPreset.fromDate === todayPreset.toDate);

const thisMonthPreset = getPresetDateRange("this_month");
assert("Preset this_month có ngày đầu tháng là 01", thisMonthPreset.fromDate.endsWith("-01"));

const allPreset = getPresetDateRange("all");
assert("Preset all trả về rỗng", allPreset.fromDate === "" && allPreset.toDate === "");

// 4. Kiểm thử sortDataList
const sampleList = [
  { name: "Cty C", amount: 300, date: "2026-03-01" },
  { name: "Cty A", amount: 100, date: "2026-01-01" },
  { name: "Cty B", amount: 200, date: "2026-02-01" }
];

const sortedByAmountDesc = sortDataList(sampleList, "amount", "desc");
assert("Sắp xếp amount giảm dần", sortedByAmountDesc[0].amount === 300 && sortedByAmountDesc[2].amount === 100);

const sortedByAmountAsc = sortDataList(sampleList, "amount", "asc");
assert("Sắp xếp amount tăng dần", sortedByAmountAsc[0].amount === 100 && sortedByAmountAsc[2].amount === 300);

const sortedByNameAsc = sortDataList(sampleList, "name", "asc");
assert("Sắp xếp tên A-Z", sortedByNameAsc[0].name === "Cty A" && sortedByNameAsc[2].name === "Cty C");

// 5. Kiểm thử countActiveFilters
const defaultState = {
  status: "ALL",
  partnerId: "ALL",
  fromDate: "",
  toDate: "",
  searchQuery: "",
  isAdvancedOpen: false
};

const currentState1 = { ...defaultState };
assert("Không có filter nào kích hoạt -> count = 0", countActiveFilters(currentState1, defaultState) === 0);

const currentState2 = { ...defaultState, status: "UNPAID", fromDate: "2026-08-01" };
assert("2 filter kích hoạt -> count = 2", countActiveFilters(currentState2, defaultState) === 2);

console.log(`\n🎉 KẾT QUẢ KIỂM THỬ BỘ LỌC: ${passed}/${total} TESTS PASSED!`);
if (passed !== total) {
  process.exit(1);
}
