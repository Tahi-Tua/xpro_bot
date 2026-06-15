const test = require("node:test");
const assert = require("node:assert/strict");
const { GUEST_ROLE_ID } = require("../config/channels");
const { assignGuestRole } = require("../events/memberJoin");

function createMemberMock({ hasGuest = false, guestRole = { id: GUEST_ROLE_ID, name: "Guest" } } = {}) {
  const addedRoles = [];

  return {
    addedRoles,
    guild: {
      roles: {
        cache: {
          get: (roleId) => (roleId === GUEST_ROLE_ID ? guestRole : null),
        },
      },
    },
    roles: {
      cache: {
        has: (roleId) => hasGuest && roleId === guestRole?.id,
      },
      add: async (role) => {
        addedRoles.push(role);
      },
    },
    user: {
      tag: "NewMember#0001",
    },
  };
}

test("memberJoin: assigns Guest role to new members", async () => {
  const member = createMemberMock();
  const result = await assignGuestRole(member);

  assert.equal(result.added, true);
  assert.equal(result.reason, "added");
  assert.deepEqual(member.addedRoles, [{ id: GUEST_ROLE_ID, name: "Guest" }]);
});

test("memberJoin: does not add Guest twice", async () => {
  const member = createMemberMock({ hasGuest: true });
  const result = await assignGuestRole(member);

  assert.equal(result.added, false);
  assert.equal(result.reason, "already_has_role");
  assert.deepEqual(member.addedRoles, []);
});

test("memberJoin: skips when Guest role is missing", async () => {
  const member = createMemberMock({ guestRole: null });
  const result = await assignGuestRole(member);

  assert.equal(result.added, false);
  assert.equal(result.reason, "missing_role");
  assert.deepEqual(member.addedRoles, []);
});
