---

# /fis:backend-development — Java + Spring Boot Best Practices

Reference guide cho DEV implement Story trên Spring Boot 3.x / Java 17+. Activate tự động khi `/fis:plan` detect `tech_stack: java-spring` trong TRD. Cũng dùng được standalone khi cần architecture decision.

## When to use

- Implement Story với backend Spring Boot 3.x / Java 17+
- Architecture decision: layering, DI pattern, JPA strategy
- Code review: kiểm tra anti-pattern trước khi ship
- Onboarding: new DEV cần hiểu FIS Java conventions

## When NOT to use

- Frontend — dùng `/fis:frontend-development`
- .NET backend — dùng `/fis:backend-development`
- Script/tooling (non-Spring) — follow language conventions trực tiếp

## Skill Activation Matrix

| TRD.tech_stack | Auto-activated with |
|---|---|
| `java-spring` | `/fis:plan`, `/fis:craft` |
| Manual | `/fis:backend-development` standalone |

## Project Structure (Modular Monolith)

```
src/main/java/com/fis/{module}/
├── api/           # REST controllers — @RestController, request mapping
├── service/       # Business logic — @Service, @Transactional boundary
├── repository/    # Data access — @Repository, JPA/JDBC
├── domain/        # Entities + value objects — POJO, no Spring dep
├── dto/           # Request/Response DTOs — record or class
├── mapper/        # MapStruct mappers — interface + @Mapper
├── config/        # @Configuration beans — SecurityConfig, WebMvcConfig
└── exception/     # Custom exceptions + @RestControllerAdvice handler

src/test/java/com/fis/{module}/
├── api/           # @WebMvcTest — controller unit tests
├── service/       # Mockito — service unit tests
├── repository/    # @DataJpaTest — repo slice tests
└── integration/   # @SpringBootTest + Testcontainers
```

**File naming**: `PascalCase.java` theo Java convention. Package = module name lowercase.

## Dependency Injection — Constructor Only

```java
// ✅ Constructor injection (testable, immutable)
@Service
@RequiredArgsConstructor   // Lombok generates constructor
public class UserService {
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    public UserDto findById(Long id) {
        return userRepository.findById(id)
            .map(userMapper::toDto)
            .orElseThrow(() -> new UserNotFoundException(id));
    }
}

// ❌ Field injection — không testable, mutable
@Service
public class UserService {
    @Autowired private UserRepository userRepository;  // KHÔNG dùng
}
```

## Layered Architecture Rules

| Layer | Depends on | KHÔNG phụ thuộc |
|---|---|---|
| `api/` | service, dto | repository, domain trực tiếp |
| `service/` | repository, domain, mapper | api |
| `repository/` | domain | service, api |
| `domain/` | Không Spring dep (POJO) | Tất cả layers |

❌ Controller gọi Repository trực tiếp = vi phạm nghiêm trọng.
❌ Entity expose qua API response — luôn map sang DTO.

## JPA / Hibernate Best Practices

```java
// Entity — chỉ trong domain layer
@Entity
@Table(name = "users")
@Getter @Setter
@NoArgsConstructor
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Version                          // Optimistic locking
    private Long version;

    @CreatedDate                      // Spring Data Auditing
    @Column(updatable = false)
    private LocalDateTime createdAt;
}

// DTO — tách biệt hoàn toàn
public record UserDto(Long id, String name) {}

// Mapper — MapStruct (compile-time, zero reflection)
@Mapper(componentModel = "spring")
public interface UserMapper {
    UserDto toDto(User user);
    User toEntity(CreateUserRequest req);
}
```

**N+1 prevention:**
```java
// ❌ N+1 — lazy load trong loop
users.forEach(u -> u.getOrders().size());  // N queries

// ✅ EntityGraph hoặc JOIN FETCH
@EntityGraph(attributePaths = {"orders"})
List<User> findAllWithOrders();

// ✅ JPQL với JOIN FETCH
@Query("SELECT u FROM User u LEFT JOIN FETCH u.orders WHERE u.status = :status")
List<User> findByStatusWithOrders(@Param("status") UserStatus status);
```

**Transaction boundary:**
```java
// @Transactional ở Service, KHÔNG ở Controller
@Service
@Transactional(readOnly = true)   // default read-only cho perf
public class UserService {
    public UserDto findById(Long id) { ... }

    @Transactional                  // override cho write ops
    public UserDto createUser(CreateUserRequest req) { ... }
}
```

## Validation

```java
// Request DTO với Bean Validation
public record CreateUserRequest(
    @NotBlank @Size(max = 100) String name,
    @Email @NotBlank String email,
    @NotNull @Min(0) BigDecimal initialBalance
) {}

// Controller — @Valid trigger validation
@PostMapping("/users")
ResponseEntity<UserDto> createUser(@Valid @RequestBody CreateUserRequest req) {
    return ResponseEntity.status(201).body(service.createUser(req));
}

// Global exception handler
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        var detail = ProblemDetail.forStatus(400);
        detail.setTitle("Validation failed");
        detail.setProperty("errors", ex.getBindingResult().getFieldErrors()
            .stream().map(e -> e.getField() + ": " + e.getDefaultMessage())
            .toList());
        return detail;
    }

    @ExceptionHandler(UserNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    ProblemDetail handleNotFound(UserNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(404, ex.getMessage());
    }
}
```

## Configuration

```yaml
# application.yml (dùng YAML, không .properties)
spring:
  datasource:
    url: ${DB_URL}              # env var — không hardcode
    username: ${DB_USER}
    password: ${DB_PASSWORD}
  jpa:
    open-in-view: false         # tắt OSIV — tránh session leak
    hibernate:
      ddl-auto: validate        # prod: validate (không auto-create)

fis:
  auth:
    jwt-secret: ${JWT_SECRET}
    token-expiry: 3600
```

```java
// Typed config — @ConfigurationProperties
@ConfigurationProperties(prefix = "fis.auth")
@Validated
public record AuthConfig(
    @NotBlank String jwtSecret,
    @Positive int tokenExpiry
) {}
// Không dùng @Value trực tiếp cho complex config
```

## Testing Strategy (TDD: Red → Green → Refactor)

```java
// 1. Unit test — @WebMvcTest (controller slice)
@WebMvcTest(UserController.class)
class UserControllerTest {
    @MockBean UserService service;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void getUser_existingId_returns200WithBody() throws Exception {
        when(service.findById(1L)).thenReturn(new UserDto(1L, "Lan"));

        mvc.perform(get("/api/users/1").accept(APPLICATION_JSON))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.id").value(1))
           .andExpect(jsonPath("$.name").value("Lan"));
    }

    @Test
    void getUser_missingId_returns404() throws Exception {
        when(service.findById(99L)).thenThrow(new UserNotFoundException(99L));

        mvc.perform(get("/api/users/99"))
           .andExpect(status().isNotFound());
    }
}

// 2. Integration test — Testcontainers
@SpringBootTest(webEnvironment = RANDOM_PORT)
@Testcontainers
class UserIntegrationTest {
    @Container
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", postgres::getJdbcUrl);
        r.add("spring.datasource.username", postgres::getUsername);
        r.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired TestRestTemplate restTemplate;

    @Test
    void createUser_validRequest_persists() {
        var req = new CreateUserRequest("Lan", "lan@fis.com", BigDecimal.ZERO);
        var res = restTemplate.postForEntity("/api/users", req, UserDto.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(res.getBody().name()).isEqualTo("Lan");
    }
}
```

## Security

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)   // REST stateless
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
            .build();
    }
}
```

- SQL injection: chỉ JPA / PreparedStatement — KHÔNG concat SQL string
- CORS: explicit `allowedOrigins` list — không `*` trên prod
- Secret: env var hoặc Vault — KHÔNG commit vào git

## Observability

```java
// Structured logging — SLF4J + Logback JSON
private static final Logger log = LoggerFactory.getLogger(UserService.class);

public UserDto findById(Long id) {
    log.info("Fetching user id={}", id);   // structured param, không String concat
    ...
}
```

```yaml
# logback-spring.xml — JSON output cho prod
management:
  endpoints.web.exposure.include: health,metrics,info
  metrics.export.prometheus.enabled: true
```

## Anti-patterns FIS

- ❌ `@Autowired` field injection — dùng constructor
- ❌ Entity trực tiếp trong API response — dùng DTO
- ❌ `@Transactional` ở Controller — chỉ ở Service
- ❌ API layer gọi Repository trực tiếp — vi phạm layering
- ❌ Optional chain > 3 level — refactor thành method rõ ràng
- ❌ Magic number / string literal — dùng enum hoặc `@ConfigurationProperties`
- ❌ `System.out.println` — dùng SLF4J logger
- ❌ `new Date()` — dùng `LocalDateTime.now()` hoặc `Instant.now()`

## Common FIS Patterns

```java
// Pagination chuẩn
@GetMapping("/users")
Page<UserDto> listUsers(
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size,
    @RequestParam(defaultValue = "id,asc") String[] sort
) {
    var pageable = PageRequest.of(page, size, Sort.by(parseSort(sort)));
    return service.findAll(pageable);
}

// Custom exception hierarchy
public class FisException extends RuntimeException { ... }
public class UserNotFoundException extends FisException {
    public UserNotFoundException(Long id) {
        super("User not found: " + id);
    }
}
```

## Quality Standards (Story-level)

- Unit test coverage: ≥ 80% cho service layer
- Integration test: phải cover happy path + key failure modes
- Không commit nếu `mvn test` fail
- Checkstyle / SpotBugs pass (CI enforced)
- API contract test: REST Assured hoặc Spring Contract Consumer cho inter-service

## Workflow Position

```
/fis:plan --story US-NNNN (detect java-spring) →
  auto-activate /fis:backend-development →
/fis:craft →
/fis:ship
```

## Reference

- Spring Boot 3.x docs: https://docs.spring.io/spring-boot/docs/3.x/reference/
- Spring Security 6: https://docs.spring.io/spring-security/reference/
- MapStruct: https://mapstruct.org/documentation/stable/reference/
- Testcontainers: https://java.testcontainers.org/
- Effective Java (Bloch) — DI, immutability, value objects
